"""POST /reanalyze: endpoint (queueing, validation) and pipeline.reanalyze_document (upsert + alert)."""

import time
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import main, pipeline
from app.models import Finding
from app.modules import m2
from app.preprocess.entity_match import Entity
from tests.test_m2_flow import CONFIG, FIRM, TEXT, FakeLLM, _output

DOC = {"id": 7, "url": "https://acme.pl/a", "author_handle": None, "status": "processed", "text_clean": TEXT}


class FakePool:
    @asynccontextmanager
    async def acquire(self):
        yield object()


@pytest.fixture
def calls(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Patch the db / embedding / alert layer used by the pipeline; record what was written."""
    rec: dict[str, Any] = {"status": [], "alerts": [], "findings": [], "doc": dict(DOC), "analyze": []}

    async def fetch_document(_p: Any, i: int) -> dict[str, Any] | None:
        return rec["doc"] if i == 7 else None

    async def embed(_t: str) -> list[float]:
        return [0.0] * 1024

    async def load_entities(_c: Any) -> list[Entity]:
        return [FIRM]

    async def settings(_p: Any, _m: int, t: float, w: dict[str, float]) -> tuple[float, dict[str, float]]:
        return t, w

    async def upsert(_c: Any, f: Any) -> Finding:
        rec["findings"].append(f)
        return Finding(**f.model_dump(), id=11, created_at=datetime.now(UTC))

    async def set_status(_p: Any, _i: int, s: str) -> None:
        rec["status"].append(s)

    async def send_alert(f: Finding, _doc: dict[str, Any], firm: str | None) -> bool:
        rec["alerts"].append((f.id, f.risk_level, firm))
        return True

    async def analyze_document(*_a: Any) -> Any:
        rec["analyze"].append(_a[-1])
        return pipeline.AnalyzeResult(document_id=_a[-1], status="processed", findings=[])

    monkeypatch.setattr(pipeline.db, "fetch_document", fetch_document)
    monkeypatch.setattr(pipeline, "embed", embed)
    monkeypatch.setattr(pipeline, "load_entities", load_entities)
    monkeypatch.setattr(pipeline.db, "load_module_settings", settings)
    monkeypatch.setattr(pipeline.db, "upsert_finding", upsert)
    monkeypatch.setattr(pipeline.db, "set_document_status", set_status)
    monkeypatch.setattr(pipeline, "send_alert", send_alert)
    monkeypatch.setattr(pipeline, "analyze_document", analyze_document)
    return rec


def _high_output() -> m2.M2Output:
    return m2.M2Output(criteria=[
        m2.CriterionResult(criterion=c, verdict="fail", quote=q, confidence=1.0)
        for c, q in [("no_guaranteed_returns", "Gwarantowany zysk."),
                     ("risk_prominence", "Zarabiaj nawet 30% miesięcznie"),
                     ("risk_warning_present", "ryzykiem utraty kapitału")]
    ])


@pytest.mark.asyncio
async def test_reanalyze_overwrites_findings_and_skips_download(calls: dict[str, Any]) -> None:
    res = await pipeline.reanalyze_document(
        FakePool(), FakeLLM(_output("Gwarantowany zysk.")), CONFIG, 7)  # type: ignore[arg-type]
    assert res.status == "processed" and calls["status"] == ["processed"]
    (f,) = calls["findings"]  # went through db.upsert_finding (ON CONFLICT DO UPDATE)
    assert f.module == 2 and f.firm_entity_id == 4


@pytest.mark.asyncio
async def test_reanalyze_high_sends_alert_again(calls: dict[str, Any]) -> None:
    cfg = {**CONFIG, "thresholds": {"m1": 0.1, "m2": 0.1, "m3": 0.1}, "risk": {"high": 0.1}}
    await pipeline.reanalyze_document(FakePool(), FakeLLM(_high_output()), cfg, 7)  # type: ignore[arg-type]
    assert calls["alerts"] == [(11, "high", "Acme Broker")]


@pytest.mark.asyncio
async def test_reanalyze_low_sends_no_alert(calls: dict[str, Any]) -> None:
    cfg = {**CONFIG, "risk": {"high": 2.0}}
    await pipeline.reanalyze_document(FakePool(), FakeLLM(_output("Gwarantowany zysk.")), cfg, 7)  # type: ignore[arg-type]
    assert calls["alerts"] == []


@pytest.mark.asyncio
async def test_reanalyze_other_module_runs_nothing(calls: dict[str, Any]) -> None:
    res = await pipeline.reanalyze_document(
        FakePool(), FakeLLM(_output("Gwarantowany zysk.")), CONFIG, 7, module=3)  # type: ignore[arg-type]
    assert res.findings == [] and calls["findings"] == [] and calls["status"] == ["processed"]


@pytest.mark.asyncio
async def test_reanalyze_unknown_document(calls: dict[str, Any]) -> None:
    with pytest.raises(pipeline.DocumentNotFound):
        await pipeline.reanalyze_document(FakePool(), FakeLLM(None), CONFIG, 99)  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_reanalyze_duplicate_is_left_alone(calls: dict[str, Any]) -> None:
    calls["doc"]["status"] = "duplicate"
    res = await pipeline.reanalyze_document(FakePool(), FakeLLM(None), CONFIG, 7)  # type: ignore[arg-type]
    assert res.status == "duplicate" and calls["status"] == [] and calls["findings"] == []


@pytest.mark.asyncio
async def test_reanalyze_without_clean_text_runs_full_analysis(calls: dict[str, Any]) -> None:
    calls["doc"].update(status="failed", text_clean=None)
    await pipeline.reanalyze_document(FakePool(), FakeLLM(None), CONFIG, 7)  # type: ignore[arg-type]
    assert calls["analyze"] == [7]


@pytest.mark.asyncio
async def test_reanalyze_llm_failure_marks_failed(calls: dict[str, Any]) -> None:
    with pytest.raises(pipeline.AnalysisFailed):
        await pipeline.reanalyze_document(FakePool(), FakeLLM(None), CONFIG, 7)  # type: ignore[arg-type]
    assert calls["status"] == ["failed"]


@pytest.mark.asyncio
async def test_batch_continues_after_failure(calls: dict[str, Any]) -> None:
    ok, failed = await pipeline.reanalyze_batch(
        FakePool(), FakeLLM(_output("Gwarantowany zysk.")), CONFIG, [99, 7])  # type: ignore[arg-type]
    assert (ok, failed) == (1, 1)


# --- endpoint ---------------------------------------------------------------------------------


@pytest.fixture
def api(monkeypatch: pytest.MonkeyPatch) -> Any:
    batches: list[tuple[list[int], int | None]] = []

    async def list_ids(_p: Any, ids: list[int] | None = None) -> list[int]:
        universe = [1, 2, 3]
        return universe if ids is None else [i for i in ids if i in universe]

    async def batch(_p: Any, _l: Any, _c: Any, ids: list[int], module: int | None = None) -> tuple[int, int]:
        batches.append((ids, module))
        return len(ids), 0

    monkeypatch.setattr(main.db, "list_document_ids", list_ids)
    monkeypatch.setattr(main.pipeline, "reanalyze_batch", batch)
    with TestClient(main.app) as client:
        main.app.state.pool, main.app.state.llm = object(), object()
        client.batches = batches  # type: ignore[attr-defined]
        yield client
        main.app.state.pool = main.app.state.llm = None


def _wait(batches: list[Any]) -> None:
    deadline = time.monotonic() + 2
    while not batches and time.monotonic() < deadline:
        time.sleep(0.01)


def test_endpoint_queues_all_processed_documents(api: Any) -> None:
    r = api.post("/reanalyze?module=2")
    assert r.status_code == 202 and r.json() == {"module": 2, "queued": 3}
    _wait(api.batches)
    assert api.batches == [([1, 2, 3], 2)]


def test_endpoint_explicit_ids(api: Any) -> None:
    r = api.post("/reanalyze?document_id=3&document_id=1&document_id=3")
    assert r.status_code == 202 and r.json() == {"module": None, "queued": 2}
    _wait(api.batches)
    assert api.batches == [([1, 3], None)]


def test_endpoint_unknown_document_is_404(api: Any) -> None:
    r = api.post("/reanalyze?document_id=1&document_id=42")
    assert r.status_code == 404 and "42" in r.json()["detail"]
    assert api.batches == []


def test_endpoint_rejects_bad_params(api: Any) -> None:
    assert api.post("/reanalyze?module=9").status_code == 422
    assert api.post("/reanalyze?document_id=0").status_code == 422


def test_endpoint_second_batch_while_running_is_409(api: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio

    async def slow(*_a: Any, **_k: Any) -> tuple[int, int]:
        await asyncio.sleep(5)
        return 0, 0

    monkeypatch.setattr(main.pipeline, "reanalyze_batch", slow)
    assert api.post("/reanalyze").status_code == 202
    assert api.post("/reanalyze").status_code == 409
