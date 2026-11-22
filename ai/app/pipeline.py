"""POST /analyze/{id} and /reanalyze: fetch -> clean -> dedup -> embed -> route -> modules -> findings."""

from __future__ import annotations

import logging
import time
from typing import Any

import asyncpg
import httpx

from app import db
from app.alerts import send_alert
from app.analysis import Settings, run_modules
from app.embeddings import embed, to_pgvector
from app.llm import LLMError, OllamaClient
from app.models import AnalyzeResult, Finding
from app.preprocess.clean import clean_text
from app.preprocess.dedup import dedup
from app.preprocess.entity_match import Entity, ensure_advertiser, load_entities
from app.scoring import weights_from_config
from app.storage import StorageError, get_html

logger = logging.getLogger("ai.pipeline")


class DocumentNotFound(Exception):
    pass


class AnalysisFailed(Exception):
    """Document was marked `failed`; the cause is in the message (and in the logs)."""


async def analyze_document(
    pool: asyncpg.Pool, llm: OllamaClient, config: dict[str, Any], document_id: int
) -> AnalyzeResult:
    started = time.monotonic()
    doc = await db.fetch_document(pool, document_id)
    if doc is None:
        raise DocumentNotFound(document_id)
    try:
        result = await _analyze(pool, llm, config, doc)
    except (StorageError, db.DatabaseError, LLMError, httpx.HTTPError, ValueError, KeyError) as exc:
        logger.error("analyze document_id=%s result=failed ms=%d error=%s",
                     document_id, (time.monotonic() - started) * 1000, exc)
        try:
            await db.set_document_status(pool, document_id, "failed")
        except db.DatabaseError as inner:
            logger.error("analyze document_id=%s could not mark failed: %s", document_id, inner)
        raise AnalysisFailed(str(exc)) from exc
    logger.info("analyze document_id=%s result=%s findings=%d ms=%d", document_id, result.status,
                len(result.findings), (time.monotonic() - started) * 1000)
    return result


async def _analyze(
    pool: asyncpg.Pool, llm: OllamaClient, config: dict[str, Any], doc: dict[str, Any]
) -> AnalyzeResult:
    document_id = int(doc["id"])
    if not doc.get("html_key"):
        raise ValueError("document has no html_key")
    text = clean_text(await get_html(doc["html_key"]))
    if not text:
        raise ValueError("no text extracted from html")

    async with pool.acquire() as conn:
        dd = await dedup(conn, document_id, text)
        if dd.duplicate_of is not None:
            await db.save_document_analysis(
                conn, document_id, text_clean=text, content_hash=dd.content_hash, simhash=dd.simhash,
                duplicate_of=dd.duplicate_of, embedding_literal=None, status="duplicate",
            )
            return AnalyzeResult(document_id=document_id, status="duplicate", findings=[])

        vector = await embed(text)
        await db.save_document_analysis(
            conn, document_id, text_clean=text, content_hash=dd.content_hash, simhash=dd.simhash,
            duplicate_of=None, embedding_literal=to_pgvector(vector), status="fetched",
        )
        entities = await load_entities(conn)

    return await _run_and_store(pool, llm, config, doc, text, vector, entities, None)


async def _run_and_store(
    pool: asyncpg.Pool, llm: OllamaClient, config: dict[str, Any], doc: dict[str, Any], text: str,
    vector: list[float], entities: list[Entity], only_module: int | None,
) -> AnalyzeResult:
    """Run the modules, upsert findings, alert on `high`, mark the document `processed`."""
    document_id = int(doc["id"])
    settings: Settings = {}
    for module in (1, 2, 3):
        settings[module] = await db.load_module_settings(
            pool, module, float(config["thresholds"][f"m{module}"]), weights_from_config(config)
        )
    _, runs = await run_modules(
        llm, config, settings, text, doc["url"], doc.get("author_handle"), entities, document_id, vector,
        only_module,
    )

    findings: list[Finding] = []
    names = {e.id: e.name for e in entities}
    for run in runs:
        if run.finding is None:
            continue
        async with pool.acquire() as conn:
            if run.advertiser and run.finding.advertiser_entity_id is None:
                run.finding.advertiser_entity_id = await ensure_advertiser(conn, *run.advertiser)
            saved = await db.upsert_finding(conn, run.finding)
        findings.append(saved)
        if saved.risk_level == "high":
            await send_alert(saved, doc, names.get(saved.firm_entity_id) if saved.firm_entity_id else None)

    await db.set_document_status(pool, document_id, "processed")
    return AnalyzeResult(document_id=document_id, status="processed", findings=findings)


async def reanalyze_document(
    pool: asyncpg.Pool, llm: OllamaClient, config: dict[str, Any], document_id: int,
    module: int | None = None,
) -> AnalyzeResult:
    """Recompute M1/M2/M3 for an already processed document and overwrite its findings (upsert).

    Skips download, cleaning and dedup: reuses `text_clean` and re-embeds it. A `high` result sends the
    alert again. Documents without clean text (`fetched`/`failed`) go through the full analysis;
    duplicates are left alone. Failures are handled like in `analyze_document`.
    """
    started = time.monotonic()
    doc = await db.fetch_document(pool, document_id)
    if doc is None:
        raise DocumentNotFound(document_id)
    if doc.get("status") == "duplicate":
        logger.info("reanalyze document_id=%s result=skipped reason=duplicate", document_id)
        return AnalyzeResult(document_id=document_id, status="duplicate", findings=[])
    text = doc.get("text_clean")
    if not text:
        return await analyze_document(pool, llm, config, document_id)
    try:
        vector = await embed(text)
        async with pool.acquire() as conn:
            entities = await load_entities(conn)
        result = await _run_and_store(pool, llm, config, doc, text, vector, entities, module)
    except (db.DatabaseError, LLMError, httpx.HTTPError, ValueError, KeyError) as exc:
        logger.error("reanalyze document_id=%s result=failed ms=%d error=%s",
                     document_id, (time.monotonic() - started) * 1000, exc)
        try:
            await db.set_document_status(pool, document_id, "failed")
        except db.DatabaseError as inner:
            logger.error("reanalyze document_id=%s could not mark failed: %s", document_id, inner)
        raise AnalysisFailed(str(exc)) from exc
    logger.info("reanalyze document_id=%s module=%s result=%s findings=%d ms=%d", document_id, module,
                result.status, len(result.findings), (time.monotonic() - started) * 1000)
    return result


async def reanalyze_batch(
    pool: asyncpg.Pool, llm: OllamaClient, config: dict[str, Any], document_ids: list[int],
    module: int | None = None,
) -> tuple[int, int]:
    """Reanalyze documents one after another; one failure never stops the rest. Returns (ok, failed)."""
    ok = failed = 0
    for document_id in document_ids:
        try:
            await reanalyze_document(pool, llm, config, document_id, module)
            ok += 1
        except (DocumentNotFound, AnalysisFailed) as exc:
            failed += 1
            logger.error("reanalyze document_id=%s skipped in batch: %s", document_id, exc)
    logger.info("reanalyze batch module=%s total=%d ok=%d failed=%d", module, len(document_ids), ok, failed)
    return ok, failed
