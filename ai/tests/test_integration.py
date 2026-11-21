import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.embeddings import DIM, OLLAMA_BASE_URL, embed, to_pgvector  # noqa: E402
from app.preprocess.dedup import dedup  # noqa: E402
from seed.seed_entities import load_rows, seed_entities  # noqa: E402

pytestmark = pytest.mark.asyncio

TEXT = (
    "Inwestowanie w fundusze ETF pozwala rozproszyć ryzyko i obniżyć koszty prowadzenia portfela "
    "długoterminowego, ale zawsze wiąże się z możliwością utraty części zainwestowanego kapitału "
    "w przypadku spadków na rynkach akcji i obligacji."
)
OTHER = (
    "Zupełnie inny tekst o gotowaniu zupy pomidorowej według starego przepisu babci, "
    "którą podajemy z makaronem, świeżą natką pietruszki i odrobiną śmietany w niedzielę."
)


async def _add(conn, n: int, text: str) -> int:
    from app.preprocess.dedup import content_hash, simhash64

    return await conn.fetchval(
        "INSERT INTO documents (url, url_hash, content_hash, simhash) VALUES ($1,$1,$2,$3) RETURNING id",
        f"u{n}", content_hash(text), simhash64(text),
    )


async def test_seed_idempotent(conn) -> None:
    n = len(load_rows())
    assert await seed_entities(conn) == (n, 0)
    assert await seed_entities(conn) == (0, n)
    assert await conn.fetchval("SELECT count(*) FROM entities") == n
    row = await conn.fetchrow("SELECT * FROM entities WHERE register_ref IS NOT NULL LIMIT 1")
    assert isinstance(row["aliases"], list)


async def test_dedup_exact_near_and_distinct(conn) -> None:
    first = await _add(conn, 1, TEXT)
    new = await conn.fetchval("INSERT INTO documents (url, url_hash) VALUES ('u2','u2') RETURNING id")

    assert (await dedup(conn, new, TEXT)).duplicate_of == first
    assert (await dedup(conn, new, TEXT.replace("akcji", "papierów"))).duplicate_of == first
    assert (await dedup(conn, new, OTHER)).duplicate_of is None


async def test_dedup_skips_duplicates_as_canonical(conn) -> None:
    first = await _add(conn, 1, TEXT)
    dup = await _add(conn, 2, TEXT)
    await conn.execute("UPDATE documents SET duplicate_of=$1 WHERE id=$2", first, dup)
    new = await conn.fetchval("INSERT INTO documents (url, url_hash) VALUES ('u3','u3') RETURNING id")
    assert (await dedup(conn, new, TEXT)).duplicate_of == first


async def test_embed_roundtrip(conn) -> None:
    try:
        vec = await embed(TEXT)
    except (httpx.HTTPError, OSError):
        pytest.skip(f"Ollama embed model not available at {OLLAMA_BASE_URL}")
    assert len(vec) == DIM
    doc = await conn.fetchval("INSERT INTO documents (url, url_hash) VALUES ('e','e') RETURNING id")
    await conn.execute("UPDATE documents SET embedding=$1::vector WHERE id=$2", to_pgvector(vec), doc)
    assert await conn.fetchval("SELECT vector_dims(embedding) FROM documents WHERE id=$1", doc) == DIM
