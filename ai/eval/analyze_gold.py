"""Make sure every gold.csv document has findings, so /eval has no missing_findings.

Usage: DATABASE_URL=postgresql://... [AI_URL=http://localhost:8000] [INTERNAL_TOKEN=...] \
       python eval/analyze_gold.py [--timeout 3600]

1. Looks up gold URLs in `documents` by sha256(url) and lists the ones that are not there
   (the collector must load them: see gold_urls_to_load.csv).
2. Queues POST /reanalyze for the documents that exist but have no finding and waits for them.
Exit code 1 when any gold document is missing or still has no finding at the end.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import logging
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

import asyncpg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.eval import GOLD_PATH, url_hash  # noqa: E402

log = logging.getLogger("analyze_gold")

BATCH = 100  # /reanalyze accepts at most 500 ids and runs one batch at a time
POLL_S = 10


def gold_urls(path: Path = GOLD_PATH) -> list[str]:
    with path.open(newline="", encoding="utf-8") as f:
        return sorted({row["url"].strip() for row in csv.DictReader(f)})


def split_by_presence(urls: list[str], ids_by_hash: dict[str, int]) -> tuple[dict[str, int], list[str]]:
    """(url -> document id for URLs in the database, URLs not in the database)."""
    found = {u: ids_by_hash[url_hash(u)] for u in urls if url_hash(u) in ids_by_hash}
    return found, [u for u in urls if u not in found]


def post_reanalyze(base: str, ids: list[int]) -> None:
    query = "&".join(f"document_id={i}" for i in ids)
    headers = {"X-Internal-Token": os.environ["INTERNAL_TOKEN"]} if os.getenv("INTERNAL_TOKEN") else {}
    req = urllib.request.Request(f"{base}/reanalyze?{query}", method="POST", headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310 (local service URL)
        log.info("reanalyze queued ids=%d response=%s", len(ids), json.load(resp))


async def without_findings(conn: asyncpg.Connection, ids: list[int]) -> list[int]:
    rows = await conn.fetch(
        "SELECT id FROM documents d WHERE id = ANY($1::bigint[]) "
        "AND NOT EXISTS (SELECT 1 FROM findings f WHERE f.document_id = d.id)",
        ids,
    )
    return [int(r["id"]) for r in rows]


async def run(dsn: str, base: str, timeout_s: int) -> int:
    urls = gold_urls()
    conn = await asyncpg.connect(dsn)
    try:
        rows = await conn.fetch(
            "SELECT id, url_hash FROM documents WHERE url_hash = ANY($1::text[])", [url_hash(u) for u in urls]
        )
        found, missing = split_by_presence(urls, {r["url_hash"]: int(r["id"]) for r in rows})
        for u in missing:
            log.warning("not in documents (collector must load): %s", u)
        log.info("gold urls=%d in_db=%d missing=%d", len(urls), len(found), len(missing))
        todo = await without_findings(conn, list(found.values()))
        log.info("documents without findings: %d", len(todo))
        for start in range(0, len(todo), BATCH):
            batch = todo[start : start + BATCH]
            post_reanalyze(base, batch)
            waited = 0
            while (left := await without_findings(conn, batch)) and waited < timeout_s:
                await asyncio.sleep(POLL_S)
                waited += POLL_S
                log.info("waiting: %d of %d in batch still without finding", len(left), len(batch))
        still = await without_findings(conn, list(found.values()))
    finally:
        await conn.close()
    # A document can legitimately get no finding when routing runs no module on it.
    log.info("done: in_db=%d missing=%d still_without_finding=%d", len(found), len(missing), len(still))
    return 1 if missing or still else 0


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timeout", type=int, default=3600, help="seconds to wait per batch")
    args = parser.parse_args()
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        sys.exit("DATABASE_URL not set")
    try:
        code = asyncio.run(run(dsn, os.getenv("AI_URL", "http://localhost:8000").rstrip("/"), args.timeout))
    except urllib.error.URLError as exc:
        sys.exit(f"ai service unreachable: {exc}")
    sys.exit(code)


if __name__ == "__main__":
    main()
