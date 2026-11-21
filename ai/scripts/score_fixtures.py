"""Score fixture documents through a running ai service, as a labelling aid for the gold set.

Usage: python scripts/score_fixtures.py [--base URL] [--out FILE] [FIXTURE.jsonl ...]

Default fixtures: collector/fixtures/sample/*.jsonl. Each record is sent to POST /analyze-text (nothing is
saved, no alerts). The output is one CSV row per (document, module that ran): url, module_expected, module,
score, risk, llm, rules, emb, top quote, and an empty `label` column for the human to fill in.
Labels are NOT guessed here: the point is to show which cases are clear and which are borderline.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_FIXTURES = sorted((REPO_ROOT / "collector" / "fixtures" / "sample").glob("*.jsonl"))
TIMEOUT_S = 300
COLUMNS = [
    "url", "module_expected", "module", "score", "risk", "llm", "rules", "emb", "top_quote", "label",
]


def post(base: str, body: dict[str, Any]) -> dict[str, Any]:
    headers = {"content-type": "application/json"}
    if os.getenv("INTERNAL_TOKEN"):
        headers["X-Internal-Token"] = os.environ["INTERNAL_TOKEN"]
    req = urllib.request.Request(
        f"{base}/analyze-text", data=json.dumps(body).encode(), headers=headers
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:  # noqa: S310 (operator-supplied URL)
        return json.load(resp)


def load_records(paths: list[Path]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for path in paths:
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                records.append(json.loads(line))
    return records


def rows_for(record: dict[str, Any], result: dict[str, Any]) -> list[dict[str, Any]]:
    expected = record.get("module_expected") or ""
    runs = result["runs"]
    if not runs:
        return [{"url": record["url"], "module_expected": expected, "module": "none", "label": ""}]
    rows = []
    for run in runs:
        reasons = (run.get("finding") or {}).get("reasons") or []
        rows.append({
            "url": record["url"],
            "module_expected": expected,
            "module": f"M{run['module']}",
            "score": f"{run['score']:.3f}",
            "risk": run["riskLevel"] or "none",
            "llm": f"{run['llm']:.2f}",
            "rules": f"{run['rules']:.2f}",
            "emb": "" if run["emb"] is None else f"{run['emb']:.2f}",
            "top_quote": reasons[0]["quote"][:120] if reasons else "",
            "label": "",
        })
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--base", default="http://localhost:8000")
    parser.add_argument("--out", type=Path, help="write CSV here instead of stdout")
    parser.add_argument("fixtures", nargs="*", type=Path, default=DEFAULT_FIXTURES)
    args = parser.parse_args()

    out = args.out.open("w", encoding="utf-8", newline="") if args.out else sys.stdout
    writer = csv.DictWriter(out, fieldnames=COLUMNS, restval="")
    writer.writeheader()
    failed = 0
    for record in load_records(args.fixtures):
        body = {
            "text": record["text"],
            "url": record["url"],
            "authorHandle": record.get("author_handle") or record.get("author"),
        }
        try:
            result = post(args.base, body)
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            sys.stderr.write(f"FAIL {record['url']}: {exc}\n")
            failed += 1
            continue
        writer.writerows(rows_for(record, result))
        out.flush()
    if args.out:
        out.close()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
