"""Exact (SHA-256) and near (simhash) duplicate detection. Sets `documents.duplicate_of`."""
import hashlib
import logging
import re
from dataclasses import dataclass

import asyncpg

log = logging.getLogger(__name__)

HAMMING_THRESHOLD = 3  # max differing bits of 64 to call two texts near-duplicates
MIN_WORDS_FOR_SIMHASH = 20  # shorter texts give unstable simhash
SHINGLE = 3

_WORD = re.compile(r"\w+")
_MASK = (1 << 64) - 1


@dataclass(frozen=True)
class DedupResult:
    content_hash: str
    simhash: int | None  # signed 64-bit, fits Postgres bigint
    duplicate_of: int | None


def _words(text: str) -> list[str]:
    return _WORD.findall(text.lower())


def content_hash(text: str) -> str:
    """SHA-256 of lowercased, whitespace-collapsed text."""
    return hashlib.sha256(" ".join(_words(text)).encode()).hexdigest()


def simhash64(text: str) -> int | None:
    """64-bit simhash over word 3-grams, as signed int. None if text is too short."""
    words = _words(text)
    if len(words) < MIN_WORDS_FOR_SIMHASH:
        return None
    grams = [" ".join(words[i : i + SHINGLE]) for i in range(len(words) - SHINGLE + 1)]
    votes = [0] * 64
    for gram in grams:
        h = int.from_bytes(hashlib.blake2b(gram.encode(), digest_size=8).digest(), "big")
        for bit in range(64):
            votes[bit] += 1 if (h >> bit) & 1 else -1
    value = sum(1 << bit for bit in range(64) if votes[bit] > 0) & _MASK
    return value - (1 << 64) if value >= (1 << 63) else value


def hamming(a: int, b: int) -> int:
    return ((a ^ b) & _MASK).bit_count()


async def dedup(conn: asyncpg.Connection, document_id: int, text: str) -> DedupResult:
    """Compute hashes and look for an earlier canonical document with the same or a near-identical text."""
    digest = content_hash(text)
    sim = simhash64(text)
    dup = await conn.fetchval(
        "SELECT id FROM documents WHERE content_hash = $1 AND id <> $2 AND duplicate_of IS NULL ORDER BY id LIMIT 1",
        digest,
        document_id,
    )
    if dup is None and sim is not None:
        dup = await conn.fetchval(
            "SELECT id FROM documents WHERE simhash IS NOT NULL AND id <> $2 AND duplicate_of IS NULL "
            "AND bit_count((simhash # $1)::bit(64)) <= $3 ORDER BY id LIMIT 1",
            sim,
            document_id,
            HAMMING_THRESHOLD,
        )
    log.info("dedup document_id=%d duplicate_of=%s", document_id, dup)
    return DedupResult(content_hash=digest, simhash=sim, duplicate_of=dup)
