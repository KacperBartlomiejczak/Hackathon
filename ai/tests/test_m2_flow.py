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
    prompt = load_prompt("m2-risk-info/system.md")
    assert prompt.version == "m2-v3"
    assert all(cid in prompt.text for cid in m2.CRITERION_WEIGHTS)  # prompt checklist matches rules/m2.yaml


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


def test_criteria_from_yaml() -> None:
    assert len(m2.CRITERION_WEIGHTS) == 8
    assert sum(m2.CRITERION_WEIGHTS.values()) == pytest.approx(1.0)
    assert {"past_performance_disclaimer", "leverage_loss_warning"} <= set(m2.CRITERION_WEIGHTS)
    with pytest.raises(ValueError):  # unknown criterion id is rejected by the LLM output schema
        m2.CriterionResult(criterion="made_up", verdict="fail", quote="x", confidence=0.5)


def test_rules_score() -> None:
    assert m2.rules_score("Ładna pogoda.") == 0.0
    assert m2.rules_score("Gwarantowany zysk, bez ryzyka!") == pytest.approx(0.7)
    assert m2.rules_score("Gwarantowany zysk, bez ryzyka, 30% miesięcznie, zarabiaj, każdy może") == 1.0


def test_new_criterion_validated_and_scored() -> None:
    out = m2.M2Output(criteria=[
        m2.CriterionResult(criterion="leverage_loss_warning", verdict="fail",
                           quote="Handluj z dźwignią 1:500", confidence=1.0),
        m2.CriterionResult(criterion="no_trivialization", verdict="fail",
                           quote="Cytat, którego nie ma w tekście", confidence=1.0),
    ])
    text = "Handluj z dźwignią 1:500 już dziś."
    reasons = validate_reasons(m2.llm_reasons(out.criteria, m2.CRITERION_WEIGHTS), text)  # rapidfuzz >= 90
    assert [r.criterion for r in reasons] == ["leverage_loss_warning"]
    assert m2.llm_score(out.criteria, {r.criterion for r in reasons}) == pytest.approx(
        m2.CRITERION_WEIGHTS["leverage_loss_warning"])


@pytest.mark.asyncio
async def test_m2_emb_blends_when_vector_present(monkeypatch: pytest.MonkeyPatch) -> None:
    assert await m2.m2_emb(None, CONFIG) is None  # no vector -> w_emb dropped

    async def fake(_v: list[float], module: int, _c: Any) -> float:
        assert module == 2
        return 1.0

    monkeypatch.setattr(m2, "emb_score", fake)
    assert await m2.m2_emb([1.0], CONFIG) == 1.0
    res = m2.M2Result(reasons=[], outputs=[], rules=0.0, prompt_version="p", model="m")
    w = {"llm": 0.6, "rules": 0.25, "emb": 0.15}
    assert m2.score_m2(res, [], w, 1.0) == pytest.approx(0.15)
    assert m2.score_m2(res, [], w, None) == 0.0


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

    async def no_emb(_v: list[float], _m: int, _c: Any) -> float:
        return 0.0

    monkeypatch.setattr(m2, "emb_score", no_emb)  # no Ollama in unit tests
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
    assert f.module == 2 and f.prompt_version == "m2-v3+m2-rules-v1" and f.firm_entity_id == 4
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
