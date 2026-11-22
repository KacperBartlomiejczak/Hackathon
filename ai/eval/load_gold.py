"""Insert gold.csv URLs that are missing from `documents`, with cleaned text, so /reanalyze can score them.

Usage: DATABASE_URL=postgresql://... python eval/load_gold.py

Text comes from the synthetic fixtures (collector/fixtures/sample/*.jsonl) when the URL is there,
otherwise the page is downloaded and cleaned with trafilatura. Pages that cannot be fetched are listed
and the exit code is 1. Run `eval/analyze_gold.py` afterwards to compute findings.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

import asyncpg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from analyze_gold import gold_urls  # noqa: E402

from app.eval import url_hash  # noqa: E402
from app.preprocess.clean import clean_text  # noqa: E402

log = logging.getLogger("load_gold")

FIXTURES = Path(__file__).resolve().parents[2] / "collector" / "fixtures" / "sample"
UA = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0"
MAX_BYTES = 5_000_000

_INSERT = """
INSERT INTO documents (url, url_hash, source_kind, title, author_handle, text_clean, status)
VALUES ($1, $2, $3, $4, $5, $6, 'fetched') ON CONFLICT (url_hash) DO NOTHING
"""


def fixture_records() -> dict[str, dict[str, str]]:
    records: dict[str, dict[str, str]] = {}
    for path in sorted(FIXTURES.glob("*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                rec = json.loads(line)
                records[rec["url"]] = rec
    return records


def download(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "pl,en;q=0.5"})
    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310 (gold.csv URLs, labelled by a human)
        raw = resp.read(MAX_BYTES)
        charset = resp.headers.get_content_charset() or "utf-8"
    return raw.decode(charset, errors="replace")


async def run(dsn: str) -> int:
    records = fixture_records()
    conn = await asyncpg.connect(dsn)
    failed: list[str] = []
    added = 0
    try:
        urls = gold_urls()
        rows = await conn.fetch(
            "SELECT url_hash FROM documents WHERE url_hash = ANY($1::text[])", [url_hash(u) for u in urls]
        )
        present = {r["url_hash"] for r in rows}
        for url in (u for u in urls if url_hash(u) not in present):
            rec = records.get(url)
            try:
                if rec:
                    text, title = rec["text"], rec.get("title")
                    author, kind = rec.get("author_handle"), "sample"
                else:
                    html = await asyncio.to_thread(download, url)
                    text, title, author, kind = clean_text(html), None, None, "web"
            except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
                log.warning("fetch failed %s: %r", url, exc)
                failed.append(url)
                continue
            if not text.strip():
                log.warning("no text extracted: %s", url)
                failed.append(url)
                continue
            await conn.execute(_INSERT, url, url_hash(url), kind, title, author, text)
            added += 1
            log.info("inserted %s (%d chars)", url, len(text))
    finally:
        await conn.close()
    log.info("done: inserted=%d failed=%d", added, len(failed))
    return 1 if failed else 0


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        sys.exit("DATABASE_URL not set")
    sys.exit(asyncio.run(run(dsn)))


if __name__ == "__main__":
    main()
