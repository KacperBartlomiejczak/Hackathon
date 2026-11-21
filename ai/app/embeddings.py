"""Embeddings from local Ollama (bge-m3), shaped for documents.embedding vector(1024)."""
import logging
import os

import httpx

log = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
EMBED_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "bge-m3")
DIM = 1024
TIMEOUT_S = 60.0


async def embed(text: str) -> list[float]:
    """Return the bge-m3 embedding of `text`. Raises on any failure, never returns a made-up vector."""
    async with httpx.AsyncClient(base_url=OLLAMA_BASE_URL, timeout=TIMEOUT_S) as client:
        resp = await client.post("/api/embed", json={"model": EMBED_MODEL, "input": text})
        resp.raise_for_status()
    vectors = resp.json().get("embeddings") or []
    if len(vectors) != 1 or len(vectors[0]) != DIM:
        raise ValueError(f"expected one {DIM}-dim vector from Ollama, got {[len(v) for v in vectors]}")
    log.info("embedded %d chars", len(text))
    return vectors[0]


def to_pgvector(vec: list[float]) -> str:
    """Text literal for `$1::vector` (avoids the pgvector client package)."""
    return "[" + ",".join(f"{x:.7g}" for x in vec) + "]"
