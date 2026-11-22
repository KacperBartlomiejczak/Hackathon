"""Quote validation: a reason survives only if its quote really occurs in the document text."""

from __future__ import annotations

import logging
import re

from rapidfuzz import fuzz

from app.models import Reason

logger = logging.getLogger("ai.quotes")

MIN_PARTIAL_RATIO = 90.0
_WS = re.compile(r"\s+")


def _squash(s: str) -> str:
    return _WS.sub(" ", s).strip()


_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


def _found(q: str, squashed_text: str) -> bool:
    """Quote occurs in the text, or it is several sentences glued by the LLM, each occurring verbatim."""
    if fuzz.partial_ratio(q, squashed_text) >= MIN_PARTIAL_RATIO:
        return True
    parts = [p for p in _SENTENCE_END.split(q) if p]
    return len(parts) > 1 and all(fuzz.partial_ratio(p, squashed_text) >= MIN_PARTIAL_RATIO for p in parts)


def quote_is_valid(quote: str, text: str) -> bool:
    q = _squash(quote)
    return bool(q) and _found(q, _squash(text))


def validate_reasons(reasons: list[Reason], text: str) -> list[Reason]:
    """Drop hallucinated quotes (partial_ratio < 90, per sentence if glued). Empty = no finding."""
    squashed = _squash(text)
    kept: list[Reason] = []
    for r in reasons:
        q = _squash(r.quote)
        if q and _found(q, squashed):
            kept.append(r)
        else:
            logger.warning("dropped reason criterion=%s: quote not found in text", r.criterion)
    return kept
