"""LLM gate (rules score below the gate -> no LLM call) and /health model-loaded check."""

import asyncio
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import main
from app.modules import common, m1, m2, m3
from app.preprocess.entity_match import M1Candidate
from tests.test_modules import ADVICE, CONFIG

W = {"llm": 0.6, "rules": 0.25, "emb": 0.15}


class ExplodingLLM:
    model = "fake"

    async def generate(self, system: str, document: str, schema: Any) -> Any:
        raise AssertionError("LLM must not be called")


class CountingLLM:
    model = "fake"

    def __init__(self, out: Any) -> None:
        self.out, self.calls = out, 0

    async def generate(self, system: str, document: str, schema: Any) -> Any:
        self.calls += 1
        return self.out


def _gated(gate: float) -> dict[str, Any]:
    return {**CONFIG, "analysis": {"llm_gate": {"m1": gate, "m2": gate, "m3": gate}}}


def _cand(rules: float) -> M1Candidate:
    return M1Candidate(firm_entity_id=1, firm_name="XTB", matched_text="XTB", quote="XTB", anchors=(),
                       advertiser=None, advertiser_entity_id=None, url="https://x.example/",
                       rules_score=rules, official_channels_known=True)


def test_llm_gate_defaults_to_disabled() -> None:
    assert common.llm_gate({}, 1) == 0.0
    assert common.llm_gate({"analysis": {}}, 2) == 0.0
    assert common.llm_gate(_gated(0.3), 3) == 0.3


@pytest.mark.asyncio
async def test_m1_below_gate_skips_llm() -> None:
    run = await m1.run_m1(ExplodingLLM(), _gated(0.3), "tekst", [0.1], [_cand(0.1)], 7, 0.6, W)  # type: ignore[arg-type]
    assert run.finding is None and run.llm == 0.0 and run.score == 0.0
    assert run.rules == pytest.approx(0.1) and run.ms == {}


@pytest.mark.asyncio
async def test_m1_gate_disabled_still_calls_llm() -> None:
    llm = CountingLLM(m1.M1Output(criteria=[
        m1.CriterionResult(criterion=c, verdict="pass", quote="x", confidence=0.5)  # type: ignore[arg-type]
        for c in m1.CRITERION_WEIGHTS]))
    await m1.run_m1(llm, CONFIG, "tekst", None, [_cand(0.0)], 7, 0.6, W)  # type: ignore[arg-type]
    assert llm.calls == 1


@pytest.mark.asyncio
async def test_m3_below_gate_skips_llm() -> None:
    run = await m3.run_m3(ExplodingLLM(), _gated(0.3), "Dziś pogoda jest ładna.", [0.1], 7, 0.6, W)  # type: ignore[arg-type]
    assert run.finding is None and run.llm == 0.0 and run.ms == {}


@pytest.mark.asyncio
async def test_m3_gate_passed_and_disabled_call_llm() -> None:
    rules, _ = m3.rules_hits(ADVICE)
    assert rules > 0
    for cfg in (_gated(rules), CONFIG):
        llm = CountingLLM(m3.M3Output(criteria=[
            m3.CriterionResult(criterion=c, verdict="pass", quote="x", confidence=0.5)  # type: ignore[arg-type]
            for c in m3.CRITERION_WEIGHTS]))
        await m3.run_m3(llm, cfg, ADVICE, None, 7, 0.6, W)  # type: ignore[arg-type]
        assert llm.calls == 1


def test_m2_gate_passed() -> None:
    text = "Dziś pogoda jest ładna."
    assert m2.rules_score(text) == 0.0
    assert m2.m2_gate_passed(text, CONFIG)  # no gate configured
    assert not m2.m2_gate_passed(text, _gated(0.3))
    assert m2.m2_gate_passed(text, _gated(0.0))


# --- /health: model resident in Ollama --------------------------------------------------------------

def _health(monkeypatch: pytest.MonkeyPatch, loaded: bool | None) -> tuple[Any, list[int]]:
    rewarms: list[int] = []

    async def ok(*_a: Any) -> bool:
        return True

    async def model_loaded(*_a: Any) -> bool | None:
        return loaded

    async def fake_warmup(_app: Any) -> None:
        rewarms.append(1)
        await asyncio.sleep(0.2)

    monkeypatch.setattr(main, "_check_ollama", ok)
    monkeypatch.setattr(main, "_check_postgres", ok)
    monkeypatch.setattr(main, "_model_loaded", model_loaded)
    monkeypatch.setattr(main, "_warmup", fake_warmup)
    with TestClient(main.app) as client:
        main.app.state.llm = SimpleNamespace(model="bielik")
        main.app.state.llm_ready = True
        try:
            r1 = client.get("/health")
            r2 = client.get("/health")
        finally:
            main.app.state.llm = None
    assert r1.status_code == r2.status_code == 200
    return r1.json(), rewarms


def test_health_llm_loading_when_model_not_in_ps(monkeypatch: pytest.MonkeyPatch) -> None:
    body, rewarms = _health(monkeypatch, False)
    assert body["llm"] == "loading"
    assert rewarms == [1]  # second /health did not start a second re-warmup


def test_health_llm_ok_when_model_in_ps_or_ps_unknown(monkeypatch: pytest.MonkeyPatch) -> None:
    for loaded in (True, None):
        body, rewarms = _health(monkeypatch, loaded)
        assert body["llm"] == "ok" and rewarms == []


def test_same_model_ignores_implicit_latest() -> None:
    assert main._same_model("bielik", "bielik:latest")
    assert main._same_model("bielik:latest", "bielik")
    assert not main._same_model("bielik:q4", "bielik")
