"""Idempotent seed of `entities` from entities.csv. Call at ai startup."""
import csv
import logging
from pathlib import Path

import asyncpg

log = logging.getLogger(__name__)

CSV_PATH = Path(__file__).parent / "entities.csv"
TYPES = {"investment_firm", "foreign_firm", "advertiser", "finfluencer", "advisory_unlicensed", "unknown"}


def _split(value: str) -> list[str]:
    return [v.strip() for v in value.split("|") if v.strip()]


def load_rows(path: Path = CSV_PATH) -> list[dict]:
    rows = []
    with path.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["type"] not in TYPES:
                raise ValueError(f"bad entity type {r['type']!r} for {r['name']!r}")
            rows.append(
                {
                    "name": r["name"].strip(),
                    "aliases": _split(r["aliases"]),
                    "type": r["type"],
                    "is_authorized": r["is_authorized"].strip().lower() == "true",
                    "register_ref": r["register_ref"] or None,
                    "nip": r["nip"] or None,
                    "official_domains": _split(r["official_domains"]),
                    "social_handles": _split(r["social_handles"]),
                }
            )
    return rows


async def seed_entities(conn: asyncpg.Connection, path: Path = CSV_PATH) -> tuple[int, int]:
    """Upsert by `name` (table has no unique constraint). Returns (inserted, updated). Never deletes."""
    rows = load_rows(path)
    inserted = updated = 0
    async with conn.transaction():
        for r in rows:
            args = (
                r["aliases"], r["type"], r["is_authorized"], r["register_ref"],
                r["nip"], r["official_domains"], r["social_handles"], r["name"],
            )
            status = await conn.execute(
                "UPDATE entities SET aliases=$1, type=$2, is_authorized=$3, register_ref=$4, nip=$5, "
                "official_domains=$6, social_handles=$7 WHERE name=$8",
                *args,
            )
            if status == "UPDATE 0":
                await conn.execute(
                    "INSERT INTO entities (aliases, type, is_authorized, register_ref, nip, "
                    "official_domains, social_handles, name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
                    *args,
                )
                inserted += 1
            else:
                updated += 1
    log.info("seed entities: inserted=%d updated=%d", inserted, updated)
    return inserted, updated
