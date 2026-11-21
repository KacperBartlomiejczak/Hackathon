"""Pieces shared by M1/M3: module run result, LLM criterion helpers, embedding-anchor score."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

import numpy as np
import yaml

from app.embeddings import embed
from app.models import FindingCreate, Reason

logger = logging.getLogger("ai.modules")

RULES_DIR = Path(__file__).resolve().parent.parent.parent / "rules"
MAX_DOC_CHARS = 8000  # head of the document goes to the LLM; quotes are validated against the full text

_anchor_cache: dict[int, np.ndarray] = {}


class CriterionLike(Protocol):
    criterion: str
    verdict: str
    quote: str
    confidence: float


@dataclass
class ModuleRun:
    """Outcome of one module on one document. `finding` is None when no quote survived validation."""

    module: int
    finding: FindingCreate | None
    llm: float = 0.0
    rules: float = 0.0
    emb: float | None = None
    score: float = 0.0
    threshold: float = 0.0
    weights: dict[str, float] = field(default_factory=dict)
    ms: dict[str, int] = field(default_factory=dict)


def llm_reasons(outputs: list[CriterionLike], weights: dict[str, float]) -> list[Reason]:
    """One reason per criterion (first wins); a criterion without a quote yields no reason."""
    seen: set[str] = set()
    reasons: list[Reason] = []
    for o in outputs:
        if o.criterion in seen or not o.quote.strip() or o.criterion not in weights:
            continue
        seen.add(o.criterion)
        reasons.append(Reason(criterion=o.criterion, verdict=o.verdict, quote=o.quote.strip(),  # type: ignore[arg-type]
                              weight=weights[o.criterion]))
    return reasons


def llm_score(outputs: list[CriterionLike], valid: set[str], weights: dict[str, float]) -> float:
    """Weighted confidence of failed criteria whose quote survived validation (0..1)."""
    return min(1.0, sum(weights[o.criterion] * o.confidence for o in outputs
                        if o.verdict == "fail" and o.criterion in valid and o.criterion in weights))


# --- embedding anchors ---------------------------------------------------------------------------

async def _anchors(module: int) -> np.ndarray:
    cached = _anchor_cache.get(module)
    if cached is not None:
        return cached
    data = yaml.safe_load((RULES_DIR / f"anchors_m{module}.yaml").read_text(encoding="utf-8"))
    vectors = [await embed(p) for p in data["phrases"]]
    mat = np.array(vectors, dtype=np.float32)
    mat /= np.linalg.norm(mat, axis=1, keepdims=True)
    _anchor_cache[module] = mat
    logger.info("anchors loaded module=%d count=%d", module, len(vectors))
    return mat


async def warm_anchors() -> None:
    for module in (1, 2, 3):
        await _anchors(module)


def rescale(cosine: float, floor: float, ceil: float) -> float:
    """Map raw bge-m3 cosine into 0..1: <= floor -> 0, >= ceil -> 1."""
    return max(0.0, min(1.0, (cosine - floor) / (ceil - floor)))


async def emb_score(doc_vector: list[float], module: int, config: dict[str, Any]) -> float:
    """Max cosine similarity of the document to the module's anchor phrases, rescaled to 0..1."""
    anchors = await _anchors(module)
    v = np.array(doc_vector, dtype=np.float32)
    v /= np.linalg.norm(v)
    emb_cfg = config.get("embedding", {})
    floor, ceil = float(emb_cfg.get("floor", 0.45)), float(emb_cfg.get("ceil", 0.75))
    return rescale(float((anchors @ v).max()), floor, ceil)
