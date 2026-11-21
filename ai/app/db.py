"""Postgres connection pool (asyncpg) configured from DATABASE_URL."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import asyncpg

from app.models import Finding, FindingCreate

logger = logging.getLogger("ai.db")

POOL_CONNECT_TIMEOUT_S = 10.0


class DatabaseError(RuntimeError):
    """Database is not configured or a query failed."""


async def open_pool(min_size: int = 1, max_size: int = 5) -> asyncpg.Pool:
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        raise DatabaseError("DATABASE_URL not set")
    try:
        pool = await asyncpg.create_pool(
            dsn, min_size=min_size, max_size=max_size, timeout=POOL_CONNECT_TIMEOUT_S
        )
    except (OSError, asyncpg.PostgresError, TimeoutError) as exc:
        raise DatabaseError(f"cannot open postgres pool: {exc}") from exc
    if pool is None:
        raise DatabaseError("cannot open postgres pool")
    logger.info("postgres pool opened (max_size=%d)", max_size)
    return pool


async def close_pool(pool: asyncpg.Pool) -> None:
    await pool.close()
    logger.info("postgres pool closed")


async def fetch_document(pool: asyncpg.Pool, document_id: int) -> dict[str, Any] | None:
    """Return the `documents` row as a dict, or None if it does not exist."""
    try:
        row = await pool.fetchrow("SELECT * FROM documents WHERE id = $1", document_id)
    except (OSError, asyncpg.PostgresError) as exc:
        raise DatabaseError(f"fetch_document({document_id}) failed: {exc}") from exc
    return dict(row) if row is not None else None


# --- analysis pipeline persistence -------------------------------------------------------------

_DOC_UPDATE = """
UPDATE documents SET text_clean = $2, content_hash = $3, simhash = $4, duplicate_of = $5,
       embedding = $6::vector, status = $7 WHERE id = $1
"""


async def save_document_analysis(
    conn: asyncpg.Connection,
    document_id: int,
    *,
    text_clean: str,
    content_hash: str,
    simhash: int | None,
    duplicate_of: int | None,
    embedding_literal: str | None,
    status: str,
) -> None:
    try:
        await conn.execute(_DOC_UPDATE, document_id, text_clean, content_hash, simhash,
                           duplicate_of, embedding_literal, status)
    except (OSError, asyncpg.PostgresError) as exc:
        raise DatabaseError(f"save_document_analysis({document_id}) failed: {exc}") from exc


async def set_document_status(pool: asyncpg.Pool, document_id: int, status: str) -> None:
    try:
        await pool.execute("UPDATE documents SET status = $2 WHERE id = $1", document_id, status)
    except (OSError, asyncpg.PostgresError) as exc:
        raise DatabaseError(f"set_document_status({document_id}) failed: {exc}") from exc


async def load_module_settings(
    pool: asyncpg.Pool, module: int, default_threshold: float, default_weights: dict[str, float]
) -> tuple[float, dict[str, float]]:
    """(threshold, weights) from module_settings; falls back to config.yaml values when no row."""
    try:
        row = await pool.fetchrow("SELECT threshold, weights FROM module_settings WHERE module = $1", module)
    except (OSError, asyncpg.PostgresError) as exc:
        raise DatabaseError(f"load_module_settings({module}) failed: {exc}") from exc
    if row is None:
        return default_threshold, default_weights
    weights = row["weights"]
    if isinstance(weights, str):
        weights = json.loads(weights)
    return float(row["threshold"]), {k: float(weights[k]) for k in ("llm", "rules", "emb")}


_UPSERT_FINDING = """
INSERT INTO findings (document_id, module, score, risk_level, label, reasons,
                      firm_entity_id, advertiser_entity_id, model, prompt_version)
VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
ON CONFLICT (document_id, module) DO UPDATE SET
  score = EXCLUDED.score, risk_level = EXCLUDED.risk_level, label = EXCLUDED.label,
  reasons = EXCLUDED.reasons, firm_entity_id = EXCLUDED.firm_entity_id,
  advertiser_entity_id = EXCLUDED.advertiser_entity_id, model = EXCLUDED.model,
  prompt_version = EXCLUDED.prompt_version, created_at = now()
RETURNING id, status, created_at
"""


async def upsert_finding(conn: asyncpg.Connection, f: FindingCreate) -> Finding:
    """Insert or update the single finding per (document, module). Review status is preserved."""
    reasons = json.dumps([r.model_dump(by_alias=True) for r in f.reasons], ensure_ascii=False)
    try:
        row = await conn.fetchrow(
            _UPSERT_FINDING, f.document_id, f.module, f.score, f.risk_level, f.label, reasons,
            f.firm_entity_id, f.advertiser_entity_id, f.model, f.prompt_version,
        )
    except (OSError, asyncpg.PostgresError) as exc:
        raise DatabaseError(f"upsert_finding(doc={f.document_id}, module={f.module}) failed: {exc}") from exc
    if row is None:
        raise DatabaseError("upsert_finding returned no row")
    return Finding(**f.model_dump(), id=row["id"], status=row["status"], created_at=row["created_at"])
