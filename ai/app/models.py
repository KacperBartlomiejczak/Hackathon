"""Pydantic models mirroring docs/contracts.md (source of truth). JSON uses camelCase."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

RiskLevel = Literal["low", "medium", "high"]
Verdict = Literal["pass", "fail"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Reason(CamelModel):
    criterion: str
    verdict: Verdict
    quote: str = Field(min_length=1)  # no quote = no flag
    weight: float = Field(ge=0, le=1)


class Finding(CamelModel):
    document_id: int
    module: Literal[1, 2, 3]
    score: float = Field(ge=0, le=1)
    risk_level: RiskLevel
    label: str
    reasons: list[Reason] = Field(min_length=1)
    firm_entity_id: int | None = None
    advertiser_entity_id: int | None = None
    model: str
    prompt_version: str


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    ollama: Literal["ok", "down"]
    models: list[str] = []
