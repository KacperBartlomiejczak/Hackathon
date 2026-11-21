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


def quote_is_valid(quote: str, text: str) -> bool:
    q = _squash(quote)
    if not q:
        return False
    return fuzz.partial_ratio(q, _squash(text)) >= MIN_PARTIAL_RATIO


def validate_reasons(reasons: list[Reason], text: str) -> list[Reason]:
    """Drop hallucinated quotes (partial_ratio < 90). Empty result = caller saves no finding."""
    squashed = _squash(text)
    kept: list[Reason] = []
    for r in reasons:
        q = _squash(r.quote)
        if q and fuzz.partial_ratio(q, squashed) >= MIN_PARTIAL_RATIO:
            kept.append(r)
        else:
            logger.warning("dropped reason criterion=%s: quote not found in text", r.criterion)
    return kept
