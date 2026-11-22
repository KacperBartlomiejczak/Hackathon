import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.preprocess.entity_match import Entity, match_entities
from seed.seed_entities import load_rows

AIXON = Entity(1, "Aixon Investment Management Sp. z o.o.", ("Aixon",), True, ("aixon.pl",), ("aixon_pl",))
XTB = Entity(2, "XTB S.A.", ("XTB", "X-Trade Brokers"), True, ("xtb.com",), ())
UNLICENSED = Entity(3, "Scam Capital", ("Scam",), False, (), ())
ENTS = [AIXON, XTB, UNLICENSED]


def one(text: str, url: str, handle: str | None = None):
    return match_entities(text, url, handle, ENTS)


def test_inflection_and_exact_quote() -> None:
    text = "Dzisiaj o inwestowaniu z Aixonem. Polecam, kod rabatowy w opisie! Reszta tekstu."
    [c] = one(text, "https://blog.example.com/post")
    assert c.firm_entity_id == 1 and c.matched_text == "Aixonem"
    assert c.quote in text and "Aixonem" in c.quote
    assert c.anchors and c.official_channels_known and c.advertiser == "blog.example.com"
    assert c.rules_score == 0.9
    assert all(r["quote"] in text for r in c.reasons)


def test_fuzzy_typo() -> None:
    [c] = one("Konto w X-Trade Brokres daje bonus na start.", "https://blog.example.com/x")
    assert c.firm_entity_id == 2


def test_short_alias_needs_anchor_and_case() -> None:
    assert one("Handlowałem na XTB przez rok.", "https://blog.example.com/x") == []
    assert one("Ciekawy xtb? Polecam!", "https://blog.example.com/x") == []
    [c] = one("Handluję na XTB, polecam, link w bio", "https://www.instagram.com/p/1", "@finfluencer")
    assert c.firm_entity_id == 2 and c.advertiser == "finfluencer"


def test_official_domain_and_subdomain_skipped() -> None:
    text = "Aixon oferuje konta, zarejestruj się dziś."
    assert one(text, "https://aixon.pl/oferta") == []
    assert one(text, "https://blog.aixon.pl/oferta") == []
    assert len(one(text, "https://notaixon.pl/oferta")) == 1


def test_official_handle_skipped_even_with_url_form() -> None:
    text = "Aixon oferuje konta, zarejestruj się dziś."
    assert one(text, "https://instagram.com/p/1", "@Aixon_PL") == []
    assert one(text, "https://instagram.com/p/1", "https://instagram.com/aixon_pl/") == []


def test_unknown_social_handle_lowers_score() -> None:
    [c] = one("X-Trade Brokers polecam!", "https://instagram.com/p/1", None)
    assert c.advertiser is None and c.rules_score == 0.7
    [c2] = one("X-Trade Brokers polecam!", "https://instagram.com/p/1", "ktos")
    assert not c2.official_channels_known and c2.rules_score == 0.8
    assert c2.reasons[-1]["verdict"] == "unclear"


def test_unauthorized_and_no_mention() -> None:
    assert one("Scam Capital to świetna firma, polecam", "https://x.com/a", "a") == []
    assert one("Zwykły tekst o pogodzie.", "https://blog.example.com") == []


def test_real_seed_rows() -> None:
    ents = [
        Entity(
            i, r["name"], tuple(r["aliases"]), r["is_authorized"],
            tuple(r["official_domains"]), tuple(r["social_handles"]),
        )
        for i, r in enumerate(load_rows(), 1)
    ]
    out = match_entities("Otwórz konto w X-Trade Brokers, polecam!", "https://blog.example.com", None, ents)
    assert any(c.firm_name.startswith("XTB") for c in out)


def _seed_entities() -> list[Entity]:
    return [
        Entity(
            i, r["name"], tuple(r["aliases"]), r["is_authorized"],
            tuple(r["official_domains"]), tuple(r["social_handles"]),
        )
        for i, r in enumerate(load_rows(), 1)
    ]


def test_official_channel_from_register_is_not_flagged() -> None:
    ents = _seed_entities()
    caspar = next(e for e in ents if e.name.startswith("Caspar") and e.official_domains)
    domain = caspar.official_domains[0]
    text = f"{caspar.aliases[0]} oferuje konto, zarejestruj się dziś."
    def names(url: str) -> set[int]:
        return {c.firm_entity_id for c in match_entities(text, url, None, ents)}

    assert caspar.id not in names(f"https://{domain}/oferta")
    assert caspar.id not in names(f"https://blog.{domain}/oferta")
    assert caspar.id in names("https://blog.example.com/recenzja")


def test_reasons_validate_against_contract_model() -> None:
    from app.models import Reason

    text = "Handluję na XTB, polecam, link w bio"
    cands = one(text, "https://instagram.com/p/1", "ktos") + one(text, "https://blog.example.com/x")
    assert cands
    for c in cands:
        for r in c.reasons:
            Reason.model_validate(r)
