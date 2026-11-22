"""M1 sponsored-ad regression (issue #83) and advertiser entity resolution — no network, no real DB."""

from typing import Any

import pytest

from app import db
from app.modules import m1
from app.preprocess.entity_match import Entity, match_entities

CONFIG = {
    "weights": {"w_llm": 0.6, "w_rules": 0.25, "w_emb": 0.15},
    "thresholds": {"m1": 0.6},
    "risk": {"high": 0.8},
    "embedding": {"floor": 0.45, "ceil": 0.75},
}
WEIGHTS = {"llm": 0.6, "rules": 0.25, "emb": 0.15}
BOS = Entity(7, "Dom Maklerski BOŚ", ("BOŚ", "bossa"), True, ("bossa.pl",), ())
URL = "https://kasa-na-gieldzie.example/wpis/bossa-ranking"
HANDLE = "@kasa_na_gieldzie"
AD = ("Testowałem pięć platform i bez dwóch zdań polecam Dom Maklerski BOŚ (bossa). "
      "Otwórz konto przez link partnerski poniżej, a przez pierwszy miesiąc zapłacisz zero prowizji.\n\n"
      "Wpis sponsorowany.")


class FakeLLM:
    model = "fake"

    def __init__(self, out: m1.M1Output) -> None:
        self.out = out

    async def generate(self, system: str, document: str, schema: Any) -> Any:
        return self.out


def _out() -> m1.M1Output:
    q = "Otwórz konto przez link partnerski poniżej, a przez pierwszy miesiąc zapłacisz zero prowizji."
    return m1.M1Output(criteria=[
        m1.CriterionResult(criterion="promotes_firm", verdict="fail", quote=q, confidence=0.95),
        m1.CriterionResult(criterion="profit_promises", verdict="pass", quote="", confidence=0.5),
        m1.CriterionResult(criterion="impersonation", verdict="pass", quote="", confidence=0.5),
    ])


@pytest.mark.asyncio
async def test_sponsored_ad_scores_above_threshold(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_emb(_v: list[float], _m: int, _c: dict[str, Any]) -> float:
        return 0.5

    monkeypatch.setattr(m1, "emb_score", fake_emb)
    cands = match_entities(AD, URL, HANDLE, [BOS], 1)
    assert cands
    run = await m1.run_m1(FakeLLM(_out()), CONFIG, AD, [0.1], cands, 1, 0.6, WEIGHTS)  # type: ignore[arg-type]
    assert run.finding is not None
    assert run.score >= 0.6
    assert run.finding.prompt_version == "m1-v2"
    assert all(r.quote in AD for r in run.finding.reasons)


def test_advertiser_identity_rule() -> None:
    assert m1.advertiser_identity(URL, HANDLE) == ("kasa-na-gieldzie.example", None)
    assert m1.advertiser_identity("https://www.instagram.com/p/1/", "@Scam") == (None, "scam")


class FakeConn:
    """In-memory stand-in for the entities table behind resolve_advertiser's two queries."""

    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []

    def transaction(self) -> "FakeConn":
        return self

    async def __aenter__(self) -> None:
        return None

    async def __aexit__(self, *_a: object) -> None:
        return None

    async def execute(self, *_a: Any) -> None:
        return None

    async def fetchval(self, query: str, *args: Any) -> int | None:
        if query is db._FIND_ADVERTISER:
            h, d = args
            for r in self.rows:
                if (h and h in {x.lstrip("@").lower() for x in r["handles"]}) or (d and d in r["domains"]):
                    return r["id"]
            return None
        name, kind, domains, handles = args
        self.rows.append({"id": len(self.rows) + 1, "name": name, "type": kind,
                          "domains": domains, "handles": handles})
        return self.rows[-1]["id"]


@pytest.mark.asyncio
async def test_resolve_advertiser_is_idempotent() -> None:
    conn = FakeConn()
    a = await db.resolve_advertiser(conn, None, "@Kasa_Na_Gieldzie")  # type: ignore[arg-type]
    b = await db.resolve_advertiser(conn, None, "kasa_na_gieldzie")  # type: ignore[arg-type]
    assert a == b == 1 and len(conn.rows) == 1 and conn.rows[0]["type"] == "finfluencer"
    c = await db.resolve_advertiser(conn, "www.Blog.example", None)  # type: ignore[arg-type]
    d = await db.resolve_advertiser(conn, "blog.example", None)  # type: ignore[arg-type]
    assert c == d == 2 and conn.rows[1]["type"] == "advertiser"
    assert await db.resolve_advertiser(conn, None, None) is None  # type: ignore[arg-type]
