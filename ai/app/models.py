"""Pydantic models mirroring docs/contracts.md (source of truth).

JSON uses camelCase (as in contracts.md); Python attributes use snake_case.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Module = Literal[1, 2, 3]
RiskLevel = Literal["low", "medium", "high"]
DocumentStatus = Literal["fetched", "processed", "duplicate", "failed"]
FindingStatus = Literal["new", "in_review", "confirmed", "dismissed"]
Verdict = Literal["pass", "fail", "unclear"]
EntityType = Literal[
    "investment_firm",
    "foreign_firm",
    "advertiser",
    "finfluencer",
    "advisory_unlicensed",
    "unknown",
]

HIGH_RISK_SCORE = 0.8


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Document(CamelModel):
    """Row of `documents`."""

    id: int
    url: str
    url_hash: str
    source_id: int | None = None
    crawl_run_id: int | None = None
    source_kind: str
    fetched_at: datetime
    published_at: datetime | None = None
    author_handle: str | None = None
    title: str | None = None
    html_key: str | None = None
    screenshot_key: str | None = None
    text_clean: str | None = None
    content_hash: str | None = None
    simhash: int | None = None
    duplicate_of: int | None = None
    embedding: list[float] | None = None
    status: DocumentStatus = "fetched"


class Entity(CamelModel):
    """Row of `entities`."""

    id: int
    name: str
    aliases: list[str] = Field(default_factory=list)
    type: EntityType
    is_authorized: bool = False
    register_ref: str | None = None
    nip: str | None = None
    official_domains: list[str] = Field(default_factory=list)
    social_handles: list[str] = Field(default_factory=list)


class Reason(CamelModel):
    """One element of `findings.reasons`. `quote` must occur in the document text."""

    criterion: str
    verdict: Verdict
    quote: str = Field(min_length=1)
    weight: float = Field(ge=0, le=1)


class FindingCreate(CamelModel):
    """Finding as produced by ai/ (input to the findings table)."""

    document_id: int
    module: Module
    score: float = Field(ge=0, le=1)
    risk_level: RiskLevel
    label: str
    reasons: list[Reason] = Field(min_length=1)  # no quote, no flag
    firm_entity_id: int | None = None
    advertiser_entity_id: int | None = None
    model: str
    prompt_version: str


class Finding(FindingCreate):
    """Row of `findings`."""

    id: int
    status: FindingStatus = "new"
    created_at: datetime


class M1Candidate(CamelModel):
    """Module 1 result: registered firm mentioned by a third party.

    TODO(contracts): not in docs/contracts.md yet; add via data-contract skill (owner: team/api).
    """

    document_id: int
    firm_entity_id: int
    advertiser_entity_id: int | None = None
    advertiser_handle: str | None = None
    url: str
    mention: str = Field(min_length=1)  # verbatim text fragment
    match_score: float = Field(ge=0, le=1)


class ModuleSettings(CamelModel):
    """Row of `module_settings`."""

    module: Module
    threshold: float = Field(default=0.6, ge=0, le=1)
    weights: dict[str, float] = Field(default_factory=lambda: {"llm": 0.6, "rules": 0.25, "emb": 0.15})


class EvalResult(CamelModel):
    """Calibration metrics on the gold set.

    TODO(contracts): shape not in docs/contracts.md yet (owner: team/api); contract lists
    precision, recall, FP, FN, TP, TN.
    """

    module: Module
    threshold: float = Field(ge=0, le=1)
    tp: int
    fp: int
    fn: int
    tn: int
    precision: float = Field(ge=0, le=1)
    recall: float = Field(ge=0, le=1)
    total: int
    missing_findings: int


class AnalyzeResult(CamelModel):
    document_id: int
    status: DocumentStatus
    findings: list[Finding] = Field(default_factory=list)


class ReanalyzeResult(CamelModel):
    module: Module | None = None
    queued: int = 0


class HealthStatus(CamelModel):
    status: Literal["ok", "degraded"]
    ollama: Literal["ok", "error"]
    postgres: Literal["ok", "error"]


def risk_level(score: float, threshold: float) -> RiskLevel:
    """high >= 0.8, medium >= module threshold, otherwise low (contracts.md)."""
    if score >= HIGH_RISK_SCORE:
        return "high"
    if score >= threshold:
        return "medium"
    return "low"
