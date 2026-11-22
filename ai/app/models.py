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


class AnalyzeTextRequest(CamelModel):
    """Demo/test input: analyse raw text without touching the database (nothing is saved, no alert)."""

    text: str = Field(min_length=20, max_length=50_000)
    url: str = "https://demo.invalid/post"
    author_handle: str | None = None
    weights: dict[str, float] | None = None  # override {"llm","rules","emb"} (as the calibration panel does)
    threshold: float | None = Field(default=None, ge=0, le=1)


class ModuleRunOut(CamelModel):
    module: Module
    score: float
    risk_level: RiskLevel | None  # None when no quote survived validation (no finding)
    threshold: float
    weights: dict[str, float]
    llm: float
    rules: float
    emb: float | None
    ms: dict[str, int]
    finding: FindingCreate | None


class AnalyzeTextResult(CamelModel):
    modules: list[Module]
    runs: list[ModuleRunOut]
    timings_ms: dict[str, int]


class ReanalyzeResult(CamelModel):
    module: Module | None = None
    queued: int = 0


class RecomputeRiskResponse(CamelModel):
    module: Module
    threshold: float
    updated: int


class HealthStatus(CamelModel):
    status: Literal["ok", "degraded"]
    ollama: Literal["ok", "error"]
    postgres: Literal["ok", "error"]
    llm: Literal["ok", "loading", "error"] = "loading"  # informational, does not affect status


def risk_level(score: float, threshold: float, high: float = HIGH_RISK_SCORE) -> RiskLevel:
    """Risk band of a score for a module.

    high   = score >= max(high, threshold)  (a threshold above `high` raises the bar for alerts too)
    medium = score >= threshold             (flagged, same rule as /eval)
    low    = otherwise
    Keep in sync with db.RISK_CASE_SQL.
    """
    if score >= max(high, threshold):
        return "high"
    if score >= threshold:
        return "medium"
    return "low"


def high_threshold(config: dict[str, object]) -> float:
    """risk.high from config.yaml, 0.8 when absent."""
    risk = config.get("risk")
    return float(risk.get("high", HIGH_RISK_SCORE)) if isinstance(risk, dict) else HIGH_RISK_SCORE
