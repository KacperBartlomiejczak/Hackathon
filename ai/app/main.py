"""InvestWatch AI service (FastAPI)."""

from __future__ import annotations

import logging
import os
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any

import asyncpg
import httpx
import yaml
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi import Path as PathParam

from app.models import (
    AnalyzeResult,
    EvalResult,
    HealthStatus,
    ReanalyzeResult,
)

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("ai")

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
        except (OSError, asyncpg.PostgresError, TimeoutError) as exc:
            logger.error("postgres pool init failed: %s", exc)
    else:
        logger.warning("DATABASE_URL not set")
    try:
        yield
    finally:
        await app.state.http.aclose()
        if app.state.pool is not None:
            await app.state.pool.close()


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


@app.get("/health", response_model=HealthStatus)
async def health(response: Response) -> HealthStatus:
    started = time.perf_counter()
    ollama_ok = await _check_ollama(app.state.http)
    pg_ok = await _check_postgres(app.state.pool)
    ok = ollama_ok and pg_ok
    if not ok:
        response.status_code = 503
    logger.info("health ollama=%s postgres=%s took=%.3fs", ollama_ok, pg_ok, time.perf_counter() - started)
    return HealthStatus(
        status="ok" if ok else "degraded",
        ollama="ok" if ollama_ok else "error",
        postgres="ok" if pg_ok else "error",
    )


@app.post("/analyze/{document_id}", response_model=AnalyzeResult, status_code=501)
async def analyze(document_id: Annotated[int, PathParam(ge=1)]) -> AnalyzeResult:
    logger.info("analyze document_id=%s result=not_implemented", document_id)
    raise HTTPException(status_code=501, detail="not implemented")


@app.post("/reanalyze", response_model=ReanalyzeResult, status_code=501)
async def reanalyze(module: Annotated[int | None, Query(ge=1, le=3)] = None) -> ReanalyzeResult:
    logger.info("reanalyze module=%s result=not_implemented", module)
    raise HTTPException(status_code=501, detail="not implemented")


# contracts.md specifies GET /eval (the request asked for POST; contract wins).
@app.get("/eval", response_model=EvalResult, status_code=501)
async def evaluate(
    module: Annotated[int, Query(ge=1, le=3)],
    threshold: Annotated[float, Query(ge=0, le=1)],
) -> EvalResult:
    logger.info("eval module=%s threshold=%s result=not_implemented", module, threshold)
    raise HTTPException(status_code=501, detail="not implemented")
