import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.preprocess.dedup import content_hash, dedup, hamming, simhash64

TEXT = (
    "Inwestowanie w fundusze ETF pozwala rozproszyć ryzyko i obniżyć koszty prowadzenia portfela "
    "długoterminowego, ale zawsze wiąże się z możliwością utraty części zainwestowanego kapitału "
    "w przypadku spadków na rynkach akcji i obligacji."
)
OTHER = (
    "Zupełnie inny tekst o gotowaniu zupy pomidorowej według starego przepisu babci, "
    "którą podajemy z makaronem, świeżą natką pietruszki i odrobiną śmietany w niedzielę."
)


class FakeConn:
    """In-memory stand-in for the two `documents` lookups made by dedup()."""

    def __init__(self, docs: list[tuple[int, str, int | None, int | None]]) -> None:
        self.docs = docs  # (id, content_hash, simhash, duplicate_of)

    async def fetchval(self, query: str, *args: object) -> int | None:
        canonical = [d for d in sorted(self.docs) if d[3] is None]
        if "content_hash = $1" in query:
            digest, own = args
            return next((d[0] for d in canonical if d[1] == digest and d[0] != own), None)
        sim, own, limit = args
        return next(
            (d[0] for d in canonical if d[2] is not None and d[0] != own and hamming(d[2], sim) <= limit),  # type: ignore[arg-type]
            None,
        )


def stored(
    doc_id: int, text: str, duplicate_of: int | None = None
) -> tuple[int, str, int | None, int | None]:
    return doc_id, content_hash(text), simhash64(text), duplicate_of


@pytest.mark.asyncio
async def test_exact_duplicate_by_sha256() -> None:
    res = await dedup(FakeConn([stored(1, TEXT)]), 2, "  " + TEXT.upper() + "\n")  # type: ignore[arg-type]
    assert res.duplicate_of == 1
    assert res.content_hash == content_hash(TEXT) and len(res.content_hash) == 64


@pytest.mark.asyncio
async def test_near_duplicate_by_simhash() -> None:
    changed = TEXT.replace("akcji", "papierów")
    assert content_hash(changed) != content_hash(TEXT)
    res = await dedup(FakeConn([stored(1, TEXT)]), 2, changed)  # type: ignore[arg-type]
    assert res.duplicate_of == 1 and res.simhash is not None


@pytest.mark.asyncio
async def test_different_text_is_not_duplicate() -> None:
    assert (await dedup(FakeConn([stored(1, TEXT)]), 2, OTHER)).duplicate_of is None  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_canonical_is_the_original_not_a_duplicate() -> None:
    conn = FakeConn([stored(1, TEXT), stored(2, TEXT, duplicate_of=1)])
    assert (await dedup(conn, 3, TEXT)).duplicate_of == 1  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_short_text_has_no_simhash_but_still_exact_match() -> None:
    res = await dedup(FakeConn([stored(1, "krótki tekst")]), 2, "Krótki  tekst")  # type: ignore[arg-type]
    assert res.simhash is None and res.duplicate_of == 1
