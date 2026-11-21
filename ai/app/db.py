"""Postgres connection pool (asyncpg) configured from DATABASE_URL."""

from __future__ import annotations

import logging
import os
from typing import Any

import asyncpg

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
