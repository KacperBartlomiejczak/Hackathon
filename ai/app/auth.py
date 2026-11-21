"""Shared-secret guard for the internal ai endpoints (header ``X-Internal-Token``)."""

from __future__ import annotations

import hmac
import logging
import os
from typing import Annotated

from fastapi import Header, HTTPException

logger = logging.getLogger(__name__)

_TRUE = {"1", "true", "yes", "on"}


def auth_required() -> bool:
    """Opt-in: enforced only when ``AI_REQUIRE_TOKEN`` is truthy (collector must send the header first)."""
    return os.getenv("AI_REQUIRE_TOKEN", "").strip().lower() in _TRUE


async def require_internal_token(
    x_internal_token: Annotated[str | None, Header(alias="X-Internal-Token")] = None,
) -> None:
    """FastAPI dependency: no-op while auth is disabled, fails closed if enabled without a token."""
    if not auth_required():
        return
    expected = os.getenv("INTERNAL_TOKEN", "")
    if not expected:
        logger.error("AI_REQUIRE_TOKEN is set but INTERNAL_TOKEN is empty; rejecting request")
        raise HTTPException(status_code=503, detail="internal token not configured")
    if x_internal_token is None or not hmac.compare_digest(x_internal_token.encode(), expected.encode()):
        logger.warning("rejected request: missing or invalid X-Internal-Token")
        raise HTTPException(status_code=401, detail="invalid internal token")
