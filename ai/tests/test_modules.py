"""M1/M3 modules, alerts, weight overrides — no network (fake LLM, patched embeddings)."""

from datetime import UTC, datetime
from typing import Any

import httpx
import pytest

from app import alerts
from app.analysis import default_settings, run_modules
from app.models import Finding, FindingCreate, Reason, risk_level
from app.modules import common, m1, m3
from app.preprocess.entity_match import Entity

CONFIG = {
    "weights": {"w_llm": 0.6, "w_rules": 0.25, "w_emb": 0.15},
    "thresholds": {"m1": 0.6, "m2": 0.6, "m3": 0.6},
    "risk": {"high": 0.8},
    "embedding": {"floor": 0.45, "ceil": 0.75},
}
XTB = Entity(1, "XTB S.A.", ("XTB",), True, ("xtb.com",), ())
SCAM = ("OFICJALNY partner XTB! Gwarantowany zysk 30% miesięcznie, zero ryzyka. "
        "Otwórz konto z moim kodem polecającym, link w bio.")
ADVICE = ("Zarządzam Twoim portfelem, przekaż mi kapitał. Kupuj akcje ABC, cena docelowa 50 zł. "
          "Płatna grupa VIP 99 zł miesięcznie.")


class FakeLLM:
    model = "fake"

    def __init__(self, out: Any) -> None:
        self.out = out

    async def generate(self, system: str, document: str, schema: Any) -> Any:
        assert isinstance(self.out, schema)
        return self.out


def m1_out(quote: str = "Gwarantowany zysk 30% miesięcznie, zero ryzyka.", conf: float = 0.9) -> m1.M1Output:
    return m1.M1Output(criteria=[
        m1.CriterionResult(criterion="promotes_firm", verdict="fail", quote="OFICJALNY partner XTB!",
                           confidence=conf),
        m1.CriterionResult(criterion="profit_promises", verdict="fail", quote=quote, confidence=conf),
        m1.CriterionResult(criterion="impersonation", verdict="fail", quote="OFICJALNY partner XTB!",
                           confidence=conf),
    ])


@pytest.fixture(autouse=True)
def fixed_emb(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake(_v: list[float], _m: int, _c: dict[str, Any]) -> float:
        return 0.5

    monkeypatch.setattr(m1, "emb_score", fake)
    monkeypatch.setattr(m3, "emb_score", fake)


def test_rescale() -> None:
    assert common.rescale(0.45, 0.45, 0.75) == 0.0
    assert common.rescale(0.60, 0.45, 0.75) == pytest.approx(0.5)
    assert common.rescale(0.9, 0.45, 0.75) == 1.0


def test_m3_rules_quote_is_verbatim_sentence() -> None:
    score, reasons = m3.rules_hits(ADVICE)
    assert score > 0.6
    assert {"rule:portfolio_management", "rule:direct_recommendation", "rule:paid_service"} <= {
        r.criterion for r in reasons}
    assert all(r.quote in ADVICE for r in reasons)


def test_m3_rules_noun_forms_and_plural_dm() -> None:
    text = ("Family Office Alfa Wealth - oferujemy indywidualne rekomendacje inwestycyjne oraz zarządzanie "
            "Twoim portfelem. Napisz do nas na priv, a dobierzemy akcje dopasowane do Twojego profilu.")
    score, reasons = m3.rules_hits(text)
    assert {"rule:advisory_offer", "rule:portfolio_management", "rule:private_channel"} <= {
        r.criterion for r in reasons}
    assert score >= 0.8


DISC_NEG = "Nie jest rekomendacją inwestycyjną ani informacją rekomendującą strategię inwestycyjną."
DISCLAIMER = "Ta publikacja handlowa jest informacyjna i edukacyjna. " + DISC_NEG


def test_m3_rules_ignore_disclaimer() -> None:
    assert m3.rules_hits(DISCLAIMER) == (0.0, [])
    score, reasons = m3.rules_hits(DISCLAIMER + " " + ADVICE)
    assert score > 0 and all("Nie jest rekomendacją" not in r.quote for r in reasons)


def test_m3_strip_disclaimers() -> None:
    assert m3.strip_disclaimers(DISCLAIMER + " Dziś omawiamy rynek.") == "Dziś omawiamy rynek."


@pytest.mark.asyncio
async def test_m3_disclaimer_quote_gives_no_finding() -> None:
    quote = DISC_NEG
    out = m3.M3Output(criteria=[m3.CriterionResult(criterion="individual_recommendations", verdict="fail",
                                                   quote=quote, confidence=0.9)])
    weights = {"llm": 0.5, "rules": 0.3, "emb": 0.2}
    run = await m3.run_m3(FakeLLM(out), CONFIG, DISCLAIMER, [0.1], 1, 0.6, weights)  # type: ignore[arg-type]
    assert run.finding is None


def test_m3_rules_still_flag_real_offer_next_to_disclaimer() -> None:
    disclaimer = ("Ta publikacja handlowa jest informacyjna i edukacyjna. Nie jest rekomendacją inwestycyjną "
                  "ani informacją rekomendującą lub sugerującą strategię inwestycyjną.")
    offer = " Oferujemy indywidualne rekomendacje inwestycyjne dla klientów premium."
    _, reasons = m3.rules_hits(disclaimer + offer)
    assert [r.criterion for r in reasons] == ["rule:advisory_offer"]
    assert "Oferujemy indywidualne rekomendacje" in reasons[0].quote


def test_m3_rules_quiet_text() -> None:
    assert m3.rules_hits("Dziś ładna pogoda, idziemy na spacer.")[0] == 0.0


@pytest.mark.asyncio
async def test_m1_scam_is_high_and_quotes_are_real() -> None:
    cands = [c for c in __import__("app.preprocess.entity_match", fromlist=["x"]).match_entities(
        SCAM, "https://www.instagram.com/p/1/", "@scam", [XTB], 1)]
    run = await m1.run_m1(FakeLLM(m1_out()), CONFIG, SCAM, [0.1], cands, 1, 0.6,  # type: ignore[arg-type]
                          {"llm": 0.6, "rules": 0.25, "emb": 0.15})
    assert run.finding is not None and run.finding.module == 1 and run.finding.firm_entity_id == 1
    assert run.finding.risk_level == "high" and run.score >= 0.8
    assert all(r.quote in SCAM for r in run.finding.reasons)
    got = {r.criterion for r in run.finding.reasons}
    assert got >= {"firm_mentioned", "promotes_firm", "profit_promises"}


BOS = Entity(8, "Dom Maklerski Banku Ochrony Środowiska S.A.", ("Dom Maklerski BOŚ", "BOSSA"), True,
             ("bossa.pl",), ())
SPONSORED = ("Testowałem pięć platform i bez dwóch zdań polecam Dom Maklerski BOŚ (bossa). "
             "Otwórz konto przez link partnerski poniżej, a przez pierwszy miesiąc zapłacisz zero prowizji.\n"
             "Wpis sponsorowany.")
NEUTRAL = ("Dom Maklerski BOŚ opublikował wyniki za trzeci kwartał. Przychody wzrosły o 8 proc., a liczba "
           "rachunków przekroczyła 120 tysięcy.")
W = {"llm": 0.6, "rules": 0.25, "emb": 0.15}


def _crit(name: str, verdict: str, quote: str, conf: float) -> m1.CriterionResult:
    return m1.CriterionResult(criterion=name, verdict=verdict, quote=quote, confidence=conf)  # type: ignore[arg-type]


def _m1_cands(text: str, url: str, handle: str | None) -> list[Any]:
    from app.preprocess.entity_match import match_entities
    return match_entities(text, url, handle, [BOS], 1)


@pytest.mark.asyncio
async def test_m1_sponsored_ad_without_profit_promises_reaches_threshold() -> None:
    """Issue #83: promotes_firm alone (no profit promise) must be enough to flag an evident ad."""
    out = m1.M1Output(criteria=[
        _crit("promotes_firm", "fail", "Wpis sponsorowany.", 0.95),
        _crit("profit_promises", "pass", "zero prowizji", 0.7),
        _crit("impersonation", "pass", "Wpis sponsorowany.", 0.7),
    ])
    cands = _m1_cands(SPONSORED, "https://kasa-na-gieldzie.example/wpis/bossa-ranking", "@kasa_na_gieldzie")
    run = await m1.run_m1(FakeLLM(out), CONFIG, SPONSORED, [0.1], cands, 1, 0.6, W)  # type: ignore[arg-type]
    assert run.finding is not None and run.score >= 0.6
    assert run.finding.risk_level in ("medium", "high")


@pytest.mark.asyncio
async def test_m1_low_confidence_promotion_stays_below_threshold() -> None:
    """Borderline: promotes_firm=fail with low confidence (0.4) must not be flagged by the raised weight."""
    out = m1.M1Output(criteria=[
        _crit("promotes_firm", "fail", "Wpis sponsorowany.", 0.4),
        _crit("profit_promises", "pass", "zero prowizji", 0.7),
        _crit("impersonation", "pass", "Wpis sponsorowany.", 0.7),
    ])
    cands = _m1_cands(SPONSORED, "https://kasa-na-gieldzie.example/wpis/bossa-ranking", "@kasa_na_gieldzie")
    run = await m1.run_m1(FakeLLM(out), CONFIG, SPONSORED, [0.1], cands, 1, 0.6, W)  # type: ignore[arg-type]
    assert run.finding is not None
    assert run.llm == pytest.approx(0.7 * 0.4)
    assert run.score < 0.6


@pytest.mark.asyncio
async def test_m1_neutral_mention_stays_below_threshold() -> None:
    out = m1.M1Output(criteria=[
        _crit("promotes_firm", "pass", "opublikował wyniki", 0.9),
        _crit("profit_promises", "pass", "Przychody wzrosły", 0.9),
        _crit("impersonation", "pass", "opublikował wyniki", 0.9),
    ])
    cands = _m1_cands(NEUTRAL, "https://news.example/artykul/bos-wyniki", None)
    run = await m1.run_m1(FakeLLM(out), CONFIG, NEUTRAL, [0.1], cands, 1, 0.6, W)  # type: ignore[arg-type]
    assert run.score < 0.6


@pytest.mark.asyncio
async def test_m1_hallucinated_llm_quote_is_dropped_but_rule_reasons_stay() -> None:
    run_modules_cands = __import__("app.preprocess.entity_match", fromlist=["x"]).match_entities(
        SCAM, "https://www.instagram.com/p/1/", "@scam", [XTB], 1)
    run = await m1.run_m1(FakeLLM(m1_out(quote="Lokata w złocie jest w 100% bezpieczna i zawsze rośnie")),
                          CONFIG, SCAM, None, run_modules_cands, 1, 0.6,  # type: ignore[arg-type]
                          {"llm": 0.6, "rules": 0.25, "emb": 0.15})
    assert run.finding is not None
    assert "profit_promises" not in {r.criterion for r in run.finding.reasons}
    assert run.emb is None  # no document vector -> emb dropped, weights renormalised


@pytest.mark.asyncio
async def test_m3_shadow_advisory() -> None:
    out = m3.M3Output(criteria=[
        m3.CriterionResult(criterion="portfolio_management", verdict="fail",
                           quote="Zarządzam Twoim portfelem, przekaż mi kapitał.", confidence=0.95),
        m3.CriterionResult(criterion="individual_recommendations", verdict="fail",
                           quote="Kupuj akcje ABC, cena docelowa 50 zł.", confidence=0.9),
    ])
    run = await m3.run_m3(FakeLLM(out), CONFIG, ADVICE, [0.1], 1, 0.6,  # type: ignore[arg-type]
                          {"llm": 0.6, "rules": 0.25, "emb": 0.15})
    assert run.finding is not None and run.finding.module == 3 and run.finding.label == "shadow_advisory"
    assert run.finding.prompt_version.startswith("m3-v5")
    assert run.score >= 0.6


@pytest.mark.asyncio
async def test_module_settings_weights_override_config_defaults() -> None:
    """Calibration panel writes module_settings -> run_modules must use those weights, not 0.6/0.25/0.15."""
    base = default_settings(CONFIG)
    assert base[1][1] == {"llm": 0.6, "rules": 0.25, "emb": 0.15}
    llm = FakeLLM(m1_out(conf=0.5))
    args = (llm, CONFIG)
    kw: dict[str, Any] = dict(text=SCAM, url="https://www.instagram.com/p/1/", author_handle="@scam",
                              entities=[XTB], document_id=1, doc_vector=[0.1])
    _, default_runs = await run_modules(*args, base, **kw)  # type: ignore[arg-type]
    rules_heavy = {**base, 1: (0.6, {"llm": 0.1, "rules": 0.8, "emb": 0.1})}
    _, tuned_runs = await run_modules(*args, rules_heavy, **kw)  # type: ignore[arg-type]
    assert tuned_runs[0].weights == {"llm": 0.1, "rules": 0.8, "emb": 0.1}
    assert tuned_runs[0].score > default_runs[0].score + 0.05


def _patch_two_modules(monkeypatch: pytest.MonkeyPatch, m1_fn: Any, m3_fn: Any) -> None:
    import app.analysis as analysis
    from app.routing import Route

    monkeypatch.setattr(analysis, "route_document", lambda *a, **k: Route(modules=[1, 3]))
    monkeypatch.setattr(analysis, "run_m1", m1_fn)
    monkeypatch.setattr(analysis, "run_m3", m3_fn)


async def _run_two(config: dict[str, Any]) -> list[Any]:
    _, runs = await run_modules(FakeLLM(None), config, default_settings(config),  # type: ignore[arg-type]
                                SCAM, "https://x.pl/p", None, [], 1, None)
    return runs


@pytest.mark.asyncio
async def test_modules_run_concurrently(monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio
    import time

    async def slow(module: int, *a: Any, **k: Any) -> common.ModuleRun:
        await asyncio.sleep(0.3)
        return common.ModuleRun(module=module, finding=None)

    _patch_two_modules(monkeypatch, lambda *a, **k: slow(1), lambda *a, **k: slow(3))
    started = time.monotonic()
    runs = await _run_two(CONFIG)
    assert [r.module for r in runs] == [1, 3]
    assert time.monotonic() - started < 0.55  # sequential would be >= 0.6


@pytest.mark.asyncio
async def test_failed_module_is_skipped_and_others_kept(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.llm import LLMUnavailable

    async def bad(*a: Any, **k: Any) -> common.ModuleRun:
        raise LLMUnavailable("ollama down")

    async def good(*a: Any, **k: Any) -> common.ModuleRun:
        return common.ModuleRun(module=3, finding=None, score=0.4)

    _patch_two_modules(monkeypatch, bad, good)
    runs = await _run_two(CONFIG)
    assert [r.module for r in runs] == [3]


@pytest.mark.asyncio
async def test_all_modules_failed_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.llm import LLMUnavailable

    async def bad(*a: Any, **k: Any) -> common.ModuleRun:
        raise LLMUnavailable("ollama down")

    _patch_two_modules(monkeypatch, bad, bad)
    with pytest.raises(LLMUnavailable):
        await _run_two(CONFIG)


@pytest.mark.asyncio
async def test_budget_returns_partial_result(monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio

    async def fast(*a: Any, **k: Any) -> common.ModuleRun:
        return common.ModuleRun(module=1, finding=None, score=0.5)

    async def hang(*a: Any, **k: Any) -> common.ModuleRun:
        await asyncio.sleep(30)
        raise AssertionError("must be cancelled by the budget")

    _patch_two_modules(monkeypatch, fast, hang)
    runs = await _run_two({**CONFIG, "analysis": {"budget_s": 0.2}})
    assert [r.module for r in runs] == [1]


@pytest.mark.asyncio
async def test_budget_with_nothing_finished_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio

    from app.llm import LLMUnavailable

    async def hang(*a: Any, **k: Any) -> common.ModuleRun:
        await asyncio.sleep(30)
        raise AssertionError("must be cancelled by the budget")

    _patch_two_modules(monkeypatch, hang, hang)
    with pytest.raises(LLMUnavailable):
        await _run_two({**CONFIG, "analysis": {"budget_s": 0.1}})


def test_risk_level_uses_configured_high() -> None:
    assert risk_level(0.75, 0.6, 0.7) == "high"
    assert risk_level(0.75, 0.6) == "medium"


# --- alerts ----------------------------------------------------------------------------------------

def _finding() -> Finding:
    create = FindingCreate(document_id=5, module=1, score=0.85, risk_level="high",
                           label="third_party_promotion",
                           reasons=[Reason(criterion="a", verdict="fail", quote="q", weight=0.5)],
                           firm_entity_id=1, model="fake", prompt_version="m1-v1")
    return Finding(**create.model_dump(), id=9, created_at=datetime(2026, 11, 21, 18, 0, tzinfo=UTC))


def test_alert_payload_matches_contract() -> None:
    p = alerts.build_payload(_finding(), {"url": "https://x.pl/a", "title": None}, "XTB S.A.")
    assert p == {
        "findingId": 9, "documentId": 5, "module": 1, "score": 0.85, "riskLevel": "high",
        "label": "third_party_promotion", "title": None, "url": "https://x.pl/a",
        "firm": {"id": 1, "name": "XTB S.A."}, "createdAt": "2026-11-21T18:00:00+00:00",
    }


@pytest.mark.asyncio
async def test_alert_posts_to_internal_alerts_with_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_URL", "http://api:3000")
    monkeypatch.setenv("INTERNAL_TOKEN", "secret")
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(202, json={"ok": True})

    ok = await alerts.send_alert(_finding(), {"url": "https://x.pl/a", "title": "t"}, "XTB S.A.",
                                 transport=httpx.MockTransport(handler))
    assert ok and str(seen[0].url) == "http://api:3000/internal/alerts"
    assert seen[0].headers["x-internal-token"] == "secret"


@pytest.mark.asyncio
async def test_alert_failure_never_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_URL", "http://api:3000")
    monkeypatch.setenv("INTERNAL_TOKEN", "secret")
    calls = 0

    def boom(_req: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(503)

    assert not await alerts.send_alert(_finding(), {"url": "u"}, None, transport=httpx.MockTransport(boom))
    assert calls == 2  # one retry
    monkeypatch.setenv("INTERNAL_TOKEN", "")
    assert not await alerts.send_alert(_finding(), {"url": "u"}, None)


def test_m3_contrast_clause_after_disclaimer_is_still_advice() -> None:
    """Issue #95 follow-up: a disclaimer must not hide a contrast clause with advice ("..., ale kupuj X")."""
    text = "To nie jest rekomendacja inwestycyjna, ale kupuj akcje ABC, cena docelowa 50 zł."
    score, reasons = m3.rules_hits(text)
    # the disclaimer clause itself is skipped, the contrast clause counts
    assert [r.criterion for r in reasons] == ["rule:direct_recommendation"]
    assert score > 0
    assert "kupuj" in m3.strip_disclaimers(text) and "rekomendacja" not in m3.strip_disclaimers(text)
    assert not m3.is_disclaimer_quote(text)


def test_m3_pure_disclaimer_quote_is_dropped() -> None:
    quote = ("Ta publikacja handlowa jest informacyjna i edukacyjna. Nie jest rekomendacją inwestycyjną ani "
             "informacją rekomendującą lub sugerującą strategię inwestycyjną.")
    assert m3.is_disclaimer_quote(quote)
    assert not m3.is_disclaimer_quote("Zarządzam Twoim portfelem.")


def test_m3_comma_split_keeps_advice_before_disclaimer() -> None:
    """Issue #95 follow-up: "Kupuj X, to nie jest rekomendacja." must keep the advice clause."""
    assert "Kupuj akcje X teraz" in m3.strip_disclaimers("Kupuj akcje X teraz, to nie jest rekomendacja.")
    assert "rekomendacja" not in m3.strip_disclaimers("Kupuj akcje X teraz, to nie jest rekomendacja.")


def test_m3_comma_split_keeps_advice_after_disclaimer() -> None:
    assert "kupuj akcje X teraz" in m3.strip_disclaimers("To nie jest rekomendacja, kupuj akcje X teraz.")


def test_m3_comma_split_plain_disclaimers_still_removed() -> None:
    assert m3.strip_disclaimers("To nie jest rekomendacja inwestycyjna.") == ""
    _, reasons = m3.rules_hits(m3.strip_disclaimers("Nie stanowi to porady, ani rekomendacji."))
    assert reasons == []
    _, reasons = m3.rules_hits("Nie stanowi to porady, ani rekomendacji.")
    assert reasons == []


def test_m3_rules_hit_advice_before_comma_disclaimer() -> None:
    _, reasons = m3.rules_hits("Kupuj akcje X teraz, to nie jest rekomendacja.")
    assert "rule:direct_recommendation" in {r.criterion for r in reasons}
