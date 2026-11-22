"""Calibration table for the slides: precision/recall/FP/FN per module and threshold.

Usage: DATABASE_URL=postgresql://... python eval/calibration_table.py [--out eval/calibration_table.md]

Uses the same code path as GET /eval (stored finding scores vs. gold.csv, no LLM calls).
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

import asyncpg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.eval import EvalResult, evaluate  # noqa: E402

log = logging.getLogger("calibration_table")

THRESHOLDS = (0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9)
MODULES = (1, 2, 3)
DEFAULT_OUT = Path(__file__).resolve().parent / "calibration_table.md"


def render(results: list[EvalResult]) -> str:
    """Markdown with one table per module. Notes gold rows that have no finding (scored as 0)."""
    lines = ["# Calibration table (gold.csv vs. stored findings)", ""]
    for module in MODULES:
        rows = [r for r in results if r.module == module]
        if not rows:
            continue
        missing = rows[0].missing_findings
        lines += [
            f"## M{module} (gold rows: {rows[0].total}, without finding: {missing})",
            "",
            "| threshold | TP | FP | FN | TN | precision | recall |",
            "|---|---|---|---|---|---|---|",
        ]
        lines += [
            f"| {r.threshold:.1f} | {r.tp} | {r.fp} | {r.fn} | {r.tn} | {r.precision:.2f} | {r.recall:.2f} |"
            for r in rows
        ]
        lines.append("")
    return "\n".join(lines)


async def collect(dsn: str) -> list[EvalResult]:
    conn = await asyncpg.connect(dsn)
    try:
        return [await evaluate(conn, m, t) for m in MODULES for t in THRESHOLDS]
    finally:
        await conn.close()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        sys.exit("DATABASE_URL not set")
    results = asyncio.run(collect(dsn))
    args.out.write_text(render(results), encoding="utf-8")
    log.info("wrote %s", args.out)


if __name__ == "__main__":
    main()
