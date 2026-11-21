"""High-risk findings -> POST {API_URL}/internal/alerts (payload and token header: docs/contracts.md)."""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from app.models import Finding

logger = logging.getLogger("ai.alerts")

TIMEOUT_S = 5.0
RETRIES = 1


def build_payload(finding: Finding, doc: dict[str, Any], firm_name: str | None) -> dict[str, Any]:
    firm = {"id": finding.firm_entity_id, "name": firm_name} if finding.firm_entity_id and firm_name else None
    return {
        "findingId": finding.id, "documentId": finding.document_id, "module": finding.module,
        "score": finding.score, "riskLevel": finding.risk_level, "label": finding.label,
        "title": doc.get("title"), "url": doc["url"], "firm": firm,
        "createdAt": finding.created_at.isoformat(),
    }


async def send_alert(
    finding: Finding, doc: dict[str, Any], firm_name: str | None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> bool:
    """Best effort: a failing api must never fail the analysis. Returns True when api answered 2xx."""
    base, token = os.getenv("API_URL", "").rstrip("/"), os.getenv("INTERNAL_TOKEN", "")
    if not base or not token:
        logger.error("alert finding_id=%s skipped: API_URL or INTERNAL_TOKEN not set", finding.id)
        return False
    payload = build_payload(finding, doc, firm_name)
    async with httpx.AsyncClient(timeout=TIMEOUT_S, transport=transport) as client:
        for attempt in range(RETRIES + 1):
            try:
                resp = await client.post(f"{base}/internal/alerts", json=payload,
                                         headers={"X-Internal-Token": token})
                if resp.status_code in (400, 401):  # will not get better on retry
                    logger.error("alert finding_id=%s rejected status=%d", finding.id, resp.status_code)
                    return False
                resp.raise_for_status()
            except httpx.HTTPError as exc:
                logger.warning("alert finding_id=%s attempt=%d failed: %r", finding.id, attempt + 1, exc)
                continue
            logger.info("alert finding_id=%s document_id=%s score=%.3f status=%d", finding.id,
                        finding.document_id, finding.score, resp.status_code)
            return True
    logger.error("alert finding_id=%s not delivered", finding.id)
    return False
