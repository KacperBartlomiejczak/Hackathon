"""POST /analyze/{id}: fetch -> clean -> dedup -> embed -> route -> modules -> quotes -> findings."""

from __future__ import annotations

import logging
import time
from typing import Any

import asyncpg
import httpx

from app import db
from app.embeddings import embed, to_pgvector
from app.llm import LLMError, OllamaClient
from app.models import AnalyzeResult, Finding, FindingCreate, Reason, risk_level
from app.modules.m2 import LABEL as M2_LABEL
from app.modules.m2 import run_m2, score_m2
from app.modules.quotes import validate_reasons
from app.preprocess.clean import clean_text
from app.preprocess.dedup import dedup
from app.preprocess.entity_match import load_entities
from app.routing import route_document
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

    route = route_document(text, doc["url"], doc.get("author_handle"), entities, document_id)
    logger.info("analyze document_id=%s route=%s", document_id, route.modules)

    findings: list[Finding] = []
    for module in route.modules:
        if module == 2:
            finding = await _run_m2(pool, llm, config, document_id, text, route.official_entity_id)
            if finding is not None:
                findings.append(finding)
        else:
            logger.info("analyze document_id=%s module=%d not implemented yet, skipped", document_id, module)

    await db.set_document_status(pool, document_id, "processed")
    return AnalyzeResult(document_id=document_id, status="processed", findings=findings)


async def _run_m2(
    pool: asyncpg.Pool, llm: OllamaClient, config: dict[str, Any], document_id: int, text: str,
    firm_entity_id: int | None,
) -> Finding | None:
    threshold, weights = await db.load_module_settings(
        pool, 2, float(config["thresholds"]["m2"]), weights_from_config(config)
    )
    res = await run_m2(llm, text)
    valid: list[Reason] = validate_reasons(res.reasons, text)
    if not valid:
        logger.info("analyze document_id=%s module=2 no valid quotes, no finding", document_id)
        return None
    score = score_m2(res, valid, weights)
    create = FindingCreate(
        document_id=document_id, module=2, score=score, risk_level=risk_level(score, threshold),
        label=M2_LABEL, reasons=valid, firm_entity_id=firm_entity_id,
        model=res.model, prompt_version=res.prompt_version,
    )
    async with pool.acquire() as conn:
        return await db.upsert_finding(conn, create)
