"""InvestWatch AI service (FastAPI)."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path
from typing import Annotated, Any, Literal

import asyncpg
import httpx
import yaml
from fastapi import Depends, FastAPI, HTTPException, Query, Response
from fastapi import Path as PathParam
from pydantic import Field

from app import db, pipeline
from app.analysis import default_settings, run_modules
from app.auth import require_internal_token
from app.embeddings import embed
from app.eval import evaluate as run_eval
from app.llm import LLMError, OllamaClient
from app.models import (
    AnalyzeResult,
    AnalyzeTextRequest,
    AnalyzeTextResult,
    EvalResult,
    HealthStatus,
    ModuleRunOut,
    ReanalyzeResult,
    RecomputeRiskResponse,
    high_threshold,
)
from app.modules.common import warm_anchors
from app.preprocess.clean import normalize
from app.preprocess.entity_match import Entity, load_entities
from app.scoring import weights_from_config
from seed.seed_entities import load_rows, seed_entities


def _resolve_log_level(raw: str | None) -> tuple[int, bool]:
    """Map LOG_LEVEL (shared with pino, lowercase) to a logging level.

    Returns (level, recognized). Unknown values fall back to INFO instead of crashing.
    """
    name = (raw or "INFO").strip().upper()
    if name == "TRACE":  # pino-only level
        name = "DEBUG"
    level = logging.getLevelNamesMapping().get(name)
    if level is None:
        return logging.INFO, False
    return level, True


_log_level, _log_level_ok = _resolve_log_level(os.getenv("LOG_LEVEL"))
logging.basicConfig(
    level=_log_level,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("ai")
if not _log_level_ok:
    logger.warning("unknown LOG_LEVEL=%r, using INFO", os.getenv("LOG_LEVEL"))

CONFIG_PATH = Path(os.getenv("AI_CONFIG", Path(__file__).resolve().parent.parent / "config.yaml"))
HEALTH_TIMEOUT_S = 3.0


def load_config(path: Path = CONFIG_PATH) -> dict[str, Any]:
    with path.open(encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    if not isinstance(data, dict):
        raise ValueError(f"invalid config: {path}")
    return data


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.config = load_config()
    app.state.http = httpx.AsyncClient(timeout=HEALTH_TIMEOUT_S)
    dsn = os.getenv("DATABASE_URL")
    app.state.pool = None
    if dsn:
        try:
            app.state.pool = await asyncpg.create_pool(dsn, min_size=1, max_size=5, timeout=HEALTH_TIMEOUT_S)
            async with app.state.pool.acquire() as conn:
                inserted, updated = await seed_entities(conn)
            logger.info("entities seed inserted=%s updated=%s", inserted, updated)
        except (OSError, asyncpg.PostgresError, TimeoutError) as exc:
            logger.error("postgres init/seed failed: %s", exc)
    else:
        logger.warning("DATABASE_URL not set")
    app.state.llm = None
    app.state.llm_ready = None  # None = warmup pending, True/False = model answered or not
    app.state.reanalyze_task = None
    app.state.rewarm_task = None
    try:
        llm_cfg = app.state.config.get("llm", {})
        app.state.llm = OllamaClient(timeout_s=float(llm_cfg.get("timeout_s", 60)),
                                     retries=int(llm_cfg.get("retries", 1)),
                                     max_concurrency=int(llm_cfg.get("max_concurrency", 1)),
                                     num_predict=int(llm_cfg["num_predict"]) if llm_cfg.get("num_predict")
                                     else None)
    except LLMError as exc:
        logger.error("llm client init failed: %s", exc)
    warm = asyncio.create_task(_warmup(app)) if app.state.llm is not None else None
    try:
        yield
    finally:
        if warm is not None:
            warm.cancel()
        if app.state.reanalyze_task is not None:
            app.state.reanalyze_task.cancel()
        if app.state.rewarm_task is not None:
            app.state.rewarm_task.cancel()
        if app.state.llm is not None:
            await app.state.llm.aclose()
        await app.state.http.aclose()
        if app.state.pool is not None:
            await app.state.pool.close()


async def _warmup(app: FastAPI) -> None:
    """Load Bielik and the embedding anchors in the background so the first document is not cold."""
    try:
        app.state.llm_ready = await app.state.llm.warmup()
        await warm_anchors()
    except (httpx.HTTPError, ValueError, OSError) as exc:
        app.state.llm_ready = False
        logger.warning("warmup failed: %r", exc)


app = FastAPI(title="InvestWatch AI", version="0.1.0", lifespan=lifespan)


async def _check_ollama(client: httpx.AsyncClient) -> bool:
    base = os.getenv("OLLAMA_URL")
    if not base:
        logger.error("OLLAMA_URL not set")
        return False
    try:
        resp = await client.get(f"{base.rstrip('/')}/api/tags")
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.error("ollama health failed: %s", exc)
        return False
    return True


def _same_model(a: str, b: str) -> bool:
    """Ollama names are equal when identical or differing only by an implicit ':latest' tag."""
    def norm(n: str) -> str:
        return n if ":" in n else f"{n}:latest"
    return norm(a) == norm(b)


async def _model_loaded(client: httpx.AsyncClient, model: str) -> bool | None:
    """Whether `model` is resident in Ollama memory (GET /api/ps); None when that cannot be determined."""
    base = os.getenv("OLLAMA_URL")
    if not base:
        return None
    try:
        resp = await client.get(f"{base.rstrip('/')}/api/ps")
        resp.raise_for_status()
        loaded = resp.json().get("models", [])
        return any(_same_model(model, str(m.get(k, ""))) for m in loaded for k in ("name", "model"))
    except (httpx.HTTPError, ValueError, AttributeError) as exc:
        logger.warning("ollama /api/ps failed: %r", exc)
        return None


def _ensure_rewarm(app: FastAPI) -> None:
    """Start a background re-warmup unless one is already running."""
    task: asyncio.Task[None] | None = app.state.rewarm_task
    if task is None or task.done():
        logger.info("llm model not loaded in ollama, re-warming")
        app.state.rewarm_task = asyncio.create_task(_warmup(app))


async def _check_postgres(pool: asyncpg.Pool | None) -> bool:
    if pool is None:
        return False
    try:
        async with pool.acquire(timeout=HEALTH_TIMEOUT_S) as conn:
            await conn.fetchval("SELECT 1", timeout=HEALTH_TIMEOUT_S)
    except (OSError, asyncpg.PostgresError, TimeoutError) as exc:
        logger.error("postgres health failed: %s", exc)
        return False
    return True


def _llm_state(llm: object | None, ready: bool | None) -> Literal["ok", "loading", "error"]:
    if llm is None or ready is False:
        return "error"
    return "ok" if ready else "loading"


@app.get("/health", response_model=HealthStatus)
async def health(response: Response) -> HealthStatus:
    started = time.perf_counter()
    ollama_ok = await _check_ollama(app.state.http)
    pg_ok = await _check_postgres(app.state.pool)
    ok = ollama_ok and pg_ok
    llm_state = _llm_state(app.state.llm, app.state.llm_ready)
    if ollama_ok and llm_state == "ok":
        if await _model_loaded(app.state.http, app.state.llm.model) is False:
            llm_state = "loading"
            _ensure_rewarm(app)
    if not ok:
        response.status_code = 503
    logger.info("health ollama=%s postgres=%s took=%.3fs", ollama_ok, pg_ok, time.perf_counter() - started)
    return HealthStatus(
        status="ok" if ok else "degraded",
        ollama="ok" if ollama_ok else "error",
        postgres="ok" if pg_ok else "error",
        llm=llm_state,
    )


@app.post(
    "/analyze/{document_id}", response_model=AnalyzeResult, dependencies=[Depends(require_internal_token)]
)
async def analyze(document_id: Annotated[int, PathParam(ge=1)]) -> AnalyzeResult:
    if app.state.pool is None or app.state.llm is None:
        raise HTTPException(status_code=503, detail="database or llm not configured")
    try:
        return await pipeline.analyze_document(app.state.pool, app.state.llm, app.state.config, document_id)
    except pipeline.DocumentNotFound:
        raise HTTPException(status_code=404, detail="document not found") from None
    except pipeline.AnalysisFailed as exc:
        raise HTTPException(status_code=502, detail=f"analysis failed: {exc.category}") from exc


@app.post(
    "/analyze-text", response_model=AnalyzeTextResult, dependencies=[Depends(require_internal_token)]
)
async def analyze_text(req: AnalyzeTextRequest) -> AnalyzeTextResult:
    """Run the full pipeline (embedding + routing + M1/M2/M3 + scoring) on raw text. Saves nothing."""
    if app.state.llm is None:
        raise HTTPException(status_code=503, detail="llm not configured")
    config = app.state.config
    settings = default_settings(config)
    entities: list[Entity]
    if app.state.pool is not None:
        async with app.state.pool.acquire() as conn:
            entities = await load_entities(conn)
        for module in (1, 2, 3):
            settings[module] = await db.load_module_settings(
                app.state.pool, module, settings[module][0], settings[module][1]
            )
    else:
        entities = [
            Entity(i, r["name"], tuple(r["aliases"]), r["is_authorized"], tuple(r["official_domains"]),
                   tuple(r["social_handles"]))
            for i, r in enumerate(load_rows(), start=1)
        ]
    if req.weights is not None:
        if set(req.weights) != {"llm", "rules", "emb"}:
            raise HTTPException(status_code=422, detail="weights must have keys llm, rules, emb")
        settings = {m: (t, dict(req.weights)) for m, (t, _) in settings.items()}
    if req.threshold is not None:
        settings = {m: (req.threshold, w) for m, (_, w) in settings.items()}

    timings: dict[str, int] = {}
    started = time.monotonic()
    text = normalize(req.text)
    try:
        t = time.monotonic()
        vector = await embed(text)
        timings["embed"] = int((time.monotonic() - t) * 1000)
        t = time.monotonic()
        route, runs = await run_modules(
            app.state.llm, config, settings, text, req.url, req.author_handle, entities, 0, vector
        )
        timings["modules"] = int((time.monotonic() - t) * 1000)
    except (LLMError, httpx.HTTPError, ValueError) as exc:
        logger.error("analyze-text failed: %r", exc)
        raise HTTPException(
            status_code=502, detail=f"analysis failed: {pipeline.failure_category(exc)}"
        ) from exc
    timings["total"] = int((time.monotonic() - started) * 1000)
    logger.info("analyze-text route=%s ms=%d", route.modules, timings["total"])
    return AnalyzeTextResult(
        modules=route.modules, timings_ms=timings,
        runs=[
            ModuleRunOut(module=r.module, score=r.score,  # type: ignore[arg-type]
                         risk_level=r.finding.risk_level if r.finding else None, threshold=r.threshold,
                         weights=r.weights, llm=r.llm, rules=r.rules, emb=r.emb, ms=r.ms, finding=r.finding)
            for r in runs
        ],
    )


@app.post(
    "/reanalyze",
    response_model=ReanalyzeResult,
    status_code=202,
    dependencies=[Depends(require_internal_token)],
)
async def reanalyze(
    module: Annotated[int | None, Query(ge=1, le=3)] = None,
    document_id: Annotated[list[Annotated[int, Field(ge=1)]] | None, Query(max_length=500)] = None,
) -> ReanalyzeResult:
    """Recompute findings (optionally one module / given documents) in the background.

    Without `document_id` every `processed` document is queued. `queued` = number of documents accepted.
    Findings are upserted and a `high` result sends the alert again. One batch at a time (409 otherwise).
    """
    if app.state.pool is None or app.state.llm is None:
        raise HTTPException(status_code=503, detail="database or llm not configured")
    task: asyncio.Task[Any] | None = app.state.reanalyze_task
    if task is not None and not task.done():
        raise HTTPException(status_code=409, detail="reanalyze already running")
    ids = sorted(set(document_id)) if document_id else None
    try:
        found = await db.list_document_ids(app.state.pool, ids)
    except db.DatabaseError as exc:
        logger.error("reanalyze module=%s result=failed error=%s", module, exc)
        raise HTTPException(status_code=500, detail="database error") from exc
    if ids is not None and len(found) != len(ids):
        missing = sorted(set(ids) - set(found))
        logger.warning("reanalyze module=%s result=rejected missing=%s", module, missing)
        raise HTTPException(status_code=404, detail=f"documents not found: {missing}")
    if found:
        app.state.reanalyze_task = asyncio.create_task(
            pipeline.reanalyze_batch(app.state.pool, app.state.llm, app.state.config, found, module)
        )
    logger.info("reanalyze module=%s queued=%d", module, len(found))
    return ReanalyzeResult(module=module, queued=len(found))  # type: ignore[arg-type]


@app.post(
    "/recompute-risk",
    response_model=RecomputeRiskResponse,
    dependencies=[Depends(require_internal_token)],
)
async def recompute_risk(module: Annotated[int, Query(ge=1, le=3)]) -> RecomputeRiskResponse:
    """Re-derive risk_level of stored findings from the current module threshold. No LLM, no alerts."""
    if app.state.pool is None:
        raise HTTPException(status_code=503, detail="database not configured")
    config = app.state.config
    started = time.monotonic()
    try:
        threshold, _ = await db.load_module_settings(
            app.state.pool, module, float(config["thresholds"][f"m{module}"]), weights_from_config(config)
        )
        updated = await db.recompute_risk_levels(app.state.pool, module, threshold, high_threshold(config))
    except db.DatabaseError as exc:
        logger.error("recompute-risk module=%s result=failed error=%s", module, exc)
        raise HTTPException(status_code=500, detail="database error") from exc
    logger.info("recompute-risk module=%s threshold=%s updated=%d duration_ms=%d",
                module, threshold, updated, int((time.monotonic() - started) * 1000))
    return RecomputeRiskResponse(module=module, threshold=threshold, updated=updated)  # type: ignore[arg-type]


# contracts.md specifies GET /eval (the request asked for POST; contract wins).
@app.get("/eval", response_model=EvalResult, dependencies=[Depends(require_internal_token)])
async def evaluate(
    module: Annotated[int, Query(ge=1, le=3)],
    threshold: Annotated[float, Query(ge=0, le=1)],
) -> EvalResult:
    if app.state.pool is None:
        raise HTTPException(status_code=503, detail="database not configured")
    try:
        async with app.state.pool.acquire() as conn:
            res = await run_eval(conn, module, threshold)
    except (ValueError, OSError, asyncpg.PostgresError) as exc:
        logger.error("eval module=%s threshold=%s failed: %s", module, threshold, exc)
        raise HTTPException(status_code=500, detail="eval failed") from exc
    logger.info("eval module=%s threshold=%s tp=%d fp=%d fn=%d", module, threshold, res.tp, res.fp, res.fn)
    return EvalResult(**asdict(res))
