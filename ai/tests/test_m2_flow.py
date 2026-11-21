from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

import pytest

from app import pipeline
from app.llm import LLMUnavailable
from app.models import Reason
from app.modules import m2
from app.modules.quotes import validate_reasons
from app.preprocess.dedup import DedupResult
from app.preprocess.entity_match import Entity
from app.prompts import load_prompt
from app.routing import route_document
from app.scoring import combine

TEXT = (
    "Zarabiaj nawet 30% miesięcznie z naszą platformą Acme Broker! Gwarantowany zysk. "
    "Inwestowanie wiąże się z ryzykiem utraty kapitału."
)
FIRM = Entity(4, "Acme Broker", (), True, ("acme.pl",), ("@acme",))
CONFIG = {
    "weights": {"w_llm": 0.6, "w_rules": 0.25, "w_emb": 0.15},
    "thresholds": {"m1": 0.6, "m2": 0.6, "m3": 0.6},
}


def test_prompt_version() -> None:
    assert load_prompt("m2-risk-info/system.md").version == "m2-v2"


def test_quotes_drop_hallucination() -> None:
    good = Reason(criterion="a", verdict="fail", quote="Gwarantowany zysk.", weight=0.2)
    bad = Reason(criterion="b", verdict="fail", quote="Lokata w złocie jest w 100% bezpieczna", weight=0.2)
    assert validate_reasons([good, bad], TEXT) == [good]


def test_routing() -> None:
    assert route_document(TEXT, "https://www.acme.pl/x", None, [FIRM], 1).modules == [2]
    assert route_document(TEXT, "https://blog.pl/x", None, [FIRM], 1).modules == [1]
    r = route_document("Oferuję doradztwo i zarządzam portfelem klientów.", "https://x.pl", None, [FIRM], 1)
    assert r.modules == [3]
    assert route_document("Ładna pogoda.", "https://x.pl", None, [FIRM], 1).modules == []


def test_combine_renormalises_without_emb() -> None:
    w = {"llm": 0.6, "rules": 0.25, "emb": 0.15}
    assert combine(1.0, 1.0, None, w) == pytest.approx(1.0)
    assert combine(1.0, 0.0, None, w) == pytest.approx(0.6 / 0.85)


class FakeLLM:
    model = "fake"

    def __init__(self, out: m2.M2Output | None = None) -> None:
        self.out = out

    async def generate(self, system: str, document: str, schema: Any) -> Any:
        assert "<document>" not in document  # wrapping is done by the client
        if self.out is None:
            raise LLMUnavailable("down")
        return self.out


def _output(quote: str) -> m2.M2Output:
    return m2.M2Output(criteria=[
        m2.CriterionResult(criterion="no_guaranteed_returns", verdict="fail", quote=quote, confidence=0.9),
        m2.CriterionResult(criterion="risk_warning_present", verdict="pass",
                           quote="ryzykiem utraty kapitału", confidence=0.9),
    ])


class FakeConn:
    pass


class FakePool:
    def __init__(self) -> None:
        self.status: str | None = None

    @asynccontextmanager
    async def acquire(self):
        yield FakeConn()


@pytest.fixture
def patched(monkeypatch: pytest.MonkeyPatch) -> FakePool:
    pool = FakePool()
    saved: dict[str, Any] = {}

    async def fetch_document(_p: Any, i: int) -> dict[str, Any]:
        return {"id": i, "url": "https://acme.pl/a", "html_key": "k", "author_handle": None}

    async def get_html(_k: str) -> str:
        return f"<html><body><p>{TEXT}</p></body></html>"

    async def fake_dedup(_c: Any, _i: int, _t: str) -> DedupResult:
        return DedupResult("h", 1, None)

    async def fake_embed(_t: str) -> list[float]:
        return [0.0] * 1024

    async def save(_c: Any, _i: int, **kw: Any) -> None:
        saved.update(kw)

    async def load_entities(_c: Any) -> list[Entity]:
        return [FIRM]

    async def settings(_p: Any, _m: int, t: float, w: dict[str, float]) -> tuple[float, dict[str, float]]:
        return t, w

    async def upsert(_c: Any, f: Any) -> Any:
        from app.models import Finding
        return Finding(**f.model_dump(), id=1, created_at=datetime.now(UTC))

    async def set_status(_p: Any, _i: int, s: str) -> None:
        pool.status = s

    monkeypatch.setattr(pipeline.db, "fetch_document", fetch_document)
    monkeypatch.setattr(pipeline, "get_html", get_html)
    monkeypatch.setattr(pipeline, "dedup", fake_dedup)
    monkeypatch.setattr(pipeline, "embed", fake_embed)
    monkeypatch.setattr(pipeline.db, "save_document_analysis", save)
    monkeypatch.setattr(pipeline, "load_entities", load_entities)
    monkeypatch.setattr(pipeline.db, "load_module_settings", settings)
    monkeypatch.setattr(pipeline.db, "upsert_finding", upsert)
    monkeypatch.setattr(pipeline.db, "set_document_status", set_status)
    return pool


@pytest.mark.asyncio
async def test_m2_finding_with_valid_quote(patched: FakePool) -> None:
    res = await pipeline.analyze_document(patched, FakeLLM(_output("Gwarantowany zysk.")), CONFIG, 7)  # type: ignore[arg-type]
    assert res.status == "processed" and patched.status == "processed"
    (f,) = res.findings
    assert f.module == 2 and f.prompt_version == "m2-v2" and f.firm_entity_id == 4
    assert {r.criterion for r in f.reasons} == {"no_guaranteed_returns", "risk_warning_present"}
    assert f.score > 0.3


@pytest.mark.asyncio
async def test_hallucinated_quotes_give_no_finding(patched: FakePool) -> None:
    out = m2.M2Output(criteria=[m2.CriterionResult(
        criterion="no_guaranteed_returns", verdict="fail", quote="Kryptowaluty zawsze rosną w górę!!!",
        confidence=0.9)])
    res = await pipeline.analyze_document(patched, FakeLLM(out), CONFIG, 7)  # type: ignore[arg-type]
    assert res.findings == [] and res.status == "processed"


@pytest.mark.asyncio
async def test_llm_failure_marks_failed(patched: FakePool) -> None:
    with pytest.raises(pipeline.AnalysisFailed):
        await pipeline.analyze_document(patched, FakeLLM(None), CONFIG, 7)  # type: ignore[arg-type]
    assert patched.status == "failed"
