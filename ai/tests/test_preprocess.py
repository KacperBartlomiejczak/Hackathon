import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.preprocess.clean import clean_text, normalize
from app.preprocess.dedup import content_hash, hamming, simhash64
from seed.seed_entities import load_rows

TEXT = (
    "Inwestowanie w fundusze ETF pozwala rozproszyć ryzyko i obniżyć koszty prowadzenia portfela "
    "długoterminowego, ale zawsze wiąże się z możliwością utraty części zainwestowanego kapitału "
    "w przypadku spadków na rynkach akcji i obligacji."
)


def test_normalize_nfkc_and_spaces() -> None:
    assert normalize("ｆｕｎｄ   x\n\n\n\ny") == "fund x\n\ny"


def test_clean_text_extracts_article() -> None:
    html = f"<html><body><nav>menu</nav><article><p>{TEXT}</p></article></body></html>"
    assert "ETF" in clean_text(html)


def test_clean_text_empty() -> None:
    assert clean_text("") == ""


def test_content_hash_ignores_case_and_spacing() -> None:
    assert content_hash("Ala  ma KOTA") == content_hash("ala ma\nkota")
    assert content_hash("ala ma kota") != content_hash("ala ma psa")


def test_simhash_near_and_far() -> None:
    a = simhash64(TEXT)
    b = simhash64(TEXT.replace("akcji", "papierów"))
    c = simhash64("Zupełnie inny tekst o gotowaniu zupy pomidorowej według starego przepisu babci, "
                  "którą podajemy z makaronem, świeżą natką pietruszki i odrobiną śmietany w niedzielę.")
    assert a is not None and b is not None and c is not None
    assert hamming(a, b) < hamming(a, c)
    assert -(1 << 63) <= a < (1 << 63)


def test_simhash_short_text_none() -> None:
    assert simhash64("za krótki tekst") is None


def test_seed_rows() -> None:
    rows = load_rows()
    assert len(rows) > 50
    assert all(r["name"] for r in rows)
