"""Demo scenarios against a running ai service (POST /analyze-text).

Usage: python scripts/demo_check.py [base_url]

Runs every scenario in demo/scenarios.json, compares with the expected result and prints a table.
For the borderline scenario it repeats the call with the calibrated weights (what the calibration panel
writes to module_settings) to show the score crossing 0.8. Exit code 1 when any expectation fails.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path
from typing import Any

SCENARIOS = Path(__file__).resolve().parent.parent / "demo" / "scenarios.json"
TIMEOUT_S = 300


def post(base: str, body: dict[str, Any]) -> dict[str, Any]:
    headers = {"content-type": "application/json"}
    if os.getenv("INTERNAL_TOKEN"):
        headers["X-Internal-Token"] = os.environ["INTERNAL_TOKEN"]
    req = urllib.request.Request(
        f"{base}/analyze-text", data=json.dumps(body).encode(), headers=headers
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:  # noqa: S310 (local demo URL)
        return json.load(resp)


def check(run: dict[str, Any] | None, expect: dict[str, Any]) -> list[str]:
    if run is None:
        return ["no module ran"]
    errors = []
    if "module" in expect and run["module"] != expect["module"]:
        errors.append(f"module {run['module']} != {expect['module']}")
    if "risk_level" in expect and run["riskLevel"] != expect["risk_level"]:
        errors.append(f"risk {run['riskLevel']} != {expect['risk_level']}")
    if "score_min" in expect and run["score"] < expect["score_min"]:
        errors.append(f"score {run['score']:.3f} < {expect['score_min']}")
    if "score_max" in expect and run["score"] > expect["score_max"]:
        errors.append(f"score {run['score']:.3f} > {expect['score_max']}")
    return errors


def report(title: str, result: dict[str, Any], errors: list[str]) -> None:
    run = result["runs"][0] if result["runs"] else None
    line = "OK  " if not errors else "FAIL"
    if run is None:
        sys.stdout.write(f"{line} {title}: no module ran ({result['timingsMs']['total']} ms)\n")
    else:
        sys.stdout.write(
            f"{line} {title}: M{run['module']} score={run['score']:.3f} risk={run['riskLevel']} "
            f"llm={run['llm']:.2f} rules={run['rules']:.2f} emb={run['emb']} "
            f"({result['timingsMs']['total']} ms)\n"
        )
        for r in (run["finding"] or {}).get("reasons", []):
            sys.stdout.write(f"       - {r['criterion']} [{r['verdict']}]: {r['quote'][:90]!r}\n")
    for e in errors:
        sys.stdout.write(f"       ! {e}\n")


def main() -> int:
    base = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
    failed = 0
    for sc in json.loads(SCENARIOS.read_text(encoding="utf-8")):
        result = post(base, sc["request"])
        run = result["runs"][0] if result["runs"] else None
        errors = check(run, sc["expect"])
        report(sc["title"], result, errors)
        failed += bool(errors)
        if "calibrated_weights" in sc:
            result = post(base, {**sc["request"], "weights": sc["calibrated_weights"]})
            run = result["runs"][0] if result["runs"] else None
            errors = check(run, sc["calibrated_expect"])
            report(f"  -> same text, weights {sc['calibrated_weights']}", result, errors)
            failed += bool(errors)
    sys.stdout.write(f"\n{'ALL OK' if not failed else f'{failed} FAILED'}\n")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
