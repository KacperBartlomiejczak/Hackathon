"""risk_level() must agree with /eval flagging, the SQL recompute rule and alerting (issue #84)."""

import sqlite3
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import db, main, pipeline
from app.eval import compute_metrics
from app.models import HIGH_RISK_SCORE, risk_level
from tests.test_reanalyze import CONFIG, FakeLLM, FakePool, _high_output, calls  # noqa: F401

THRESHOLDS = [0.0, 0.3, 0.5, 0.8, 0.9, 1.0]
HIGHS = [HIGH_RISK_SCORE, 0.95]
EPS = 1e-9


def _scores(threshold: float) -> list[float]:
    base = [0.0, threshold - EPS, threshold, threshold + EPS, 0.79, 0.8, 0.85, 0.9, 1.0]
    return sorted({s for s in base if 0.0 <= s <= 1.0})


GRID = [(s, t, h) for t in THRESHOLDS for h in HIGHS for s in _scores(t)]


@pytest.mark.parametrize(("score", "threshold", "high"), GRID)
def test_flagged_iff_not_low_matches_eval(score: float, threshold: float, high: float) -> None:
    """A document is flagged by compute_metrics (as /eval does) iff risk_level != low."""
    gold = {"d": True}
    res = compute_metrics(1, threshold, gold, {"d": score})
    assert (res.tp == 1) == (risk_level(score, threshold, high) != "low")


@pytest.mark.parametrize(("score", "threshold", "high"), GRID)
def test_high_requires_threshold(score: float, threshold: float, high: float) -> None:
    level = risk_level(score, threshold, high)
    assert (level == "high") == (score >= max(high, threshold))


def test_threshold_above_high_regression() -> None:
    assert risk_level(0.85, 0.9) == "low"
    assert risk_level(0.9, 0.9) == "high"
    assert risk_level(0.85, 0.5) == "high"
    assert risk_level(0.6, 0.5) == "medium"


def _sql_level(conn: sqlite3.Connection, score: float, threshold: float, high: float) -> str:
    """Run db.RISK_CASE_SQL itself in SQLite (GREATEST -> max, $n -> ?n, casts dropped)."""
    expr = db.RISK_CASE_SQL.replace("GREATEST(", "max(").replace("::float8", "")
    for n in (1, 2):
        expr = expr.replace(f"${n}", f"?{n}")
    row = conn.execute(f"SELECT {expr} FROM (SELECT ? AS score)", (threshold, high, score)).fetchone()  # noqa: S608
    return str(row[0])


@pytest.mark.parametrize(("score", "threshold", "high"), GRID)
def test_sql_case_equals_python_rule(score: float, threshold: float, high: float) -> None:
    conn = sqlite3.connect(":memory:")
    assert _sql_level(conn, score, threshold, high) == risk_level(score, threshold, high)


def test_recompute_statement_uses_shared_case() -> None:
    assert db._RECOMPUTE_RISK.count(db.RISK_CASE_SQL) == 2
    assert "IS DISTINCT FROM" in db._RECOMPUTE_RISK and "module = $3" in db._RECOMPUTE_RISK


# --- alerting through the pipeline ------------------------------------------------------------


def _cfg(threshold: float, high: float) -> dict[str, Any]:
    thresholds = {"m1": threshold, "m2": threshold, "m3": threshold}
    return {**CONFIG, "thresholds": thresholds, "risk": {"high": high}}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("threshold", "high", "alerts", "level"),
    [(0.1, 0.1, 1, "high"),     # score >= max(high, threshold) -> alert
     (0.1, 2.0, 0, "medium"),   # flagged but below high -> no alert
     (2.0, 0.1, 0, "low")],     # threshold above every score -> no alert (old code alerted here)
)
async def test_alert_only_for_high(
    calls: dict[str, Any], threshold: float, high: float, alerts: int, level: str,  # noqa: F811
) -> None:
    await pipeline.reanalyze_document(FakePool(), FakeLLM(_high_output()), _cfg(threshold, high), 7)  # type: ignore[arg-type]
    assert len(calls["alerts"]) == alerts
    assert {f.risk_level for f in calls["findings"]} == {level}


# --- /recompute-risk --------------------------------------------------------------------------


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Any:
    rec: dict[str, Any] = {"recompute": [], "alerts": 0}

    async def settings(_p: Any, _m: int, t: float, w: dict[str, float]) -> tuple[float, dict[str, float]]:
        return 0.9, w

    async def recompute(_p: Any, module: int, threshold: float, high: float) -> int:
        rec["recompute"].append((module, threshold, high))
        return 4

    async def no_alert(*_a: Any, **_k: Any) -> bool:
        rec["alerts"] += 1
        return True

    monkeypatch.setattr(main.db, "load_module_settings", settings)
    monkeypatch.setattr(main.db, "recompute_risk_levels", recompute)
    monkeypatch.setattr(pipeline, "send_alert", no_alert)
    monkeypatch.setattr("app.alerts.send_alert", no_alert)
    with TestClient(main.app) as c:
        main.app.state.pool = object()
        c.rec = rec  # type: ignore[attr-defined]
        yield c
        main.app.state.pool = None


def test_recompute_endpoint_updates_levels_without_alerts(client: Any) -> None:
    r = client.post("/recompute-risk?module=2")
    assert r.status_code == 200 and r.json() == {"module": 2, "threshold": 0.9, "updated": 4}
    (module, threshold, high) = client.rec["recompute"][0]
    assert (module, threshold) == (2, 0.9) and high == main.high_threshold(main.app.state.config)
    assert client.rec["alerts"] == 0


@pytest.mark.parametrize("bad", ["module=9", "module=0", "module=x", ""])
def test_recompute_endpoint_rejects_bad_module(client: Any, bad: str) -> None:
    assert client.post(f"/recompute-risk?{bad}").status_code == 422
    assert client.rec["recompute"] == []
