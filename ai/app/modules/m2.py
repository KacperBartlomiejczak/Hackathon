"""Module 2: risk information in advertising published by a registered firm itself."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any, Literal

import yaml
from pydantic import BaseModel, Field

from app.llm import OllamaClient
from app.models import Reason
from app.modules.common import RULES_DIR, QuoteStr, emb_score, llm_gate, llm_reasons
from app.modules.common import llm_score as common_llm_score
from app.prompts import load_prompt
from app.scoring import combine

logger = logging.getLogger("ai.m2")

PROMPT_PATH = "m2-risk-info/system.md"
MAX_DOC_CHARS = 8000  # head of the document only; quotes are validated against the full text
LABEL = "risk_info_insufficient"


def _load() -> tuple[str, dict[str, float], list[tuple[str, float, re.Pattern[str]]]]:
    data = yaml.safe_load((RULES_DIR / "m2.yaml").read_text(encoding="utf-8"))
    weights = {c["id"]: float(c["weight"]) for c in data["criteria"]}
    rules = [(r["id"], float(r["weight"]), re.compile(r["pattern"], re.IGNORECASE)) for r in data["rules"]]
    if sum(weights.values()) < 1.0 - 1e-6 or any(not 0 < w <= 1 for w in weights.values()):
        raise ValueError("rules/m2.yaml: criteria weights must be in (0, 1] and sum to at least 1")
    return data["version"], weights, rules


# CRITERION_WEIGHTS: criterion id -> weight of a failed criterion in the llm score (llm = min(1, sum))
RULES_VERSION, CRITERION_WEIGHTS, _RULE_PATTERNS = _load()
CriterionId = Literal[tuple(CRITERION_WEIGHTS)]  # type: ignore[valid-type]  # enum in the LLM JSON schema


class CriterionResult(BaseModel):
    criterion: CriterionId
    verdict: Literal["pass", "fail", "unclear"]
    quote: QuoteStr
    confidence: float = Field(ge=0, le=1)


class M2Output(BaseModel):
    # minItems/maxItems only in the JSON schema sent to Ollama: without them Bielik answers `[]` and llm = 0.
    criteria: list[CriterionResult] = Field(json_schema_extra={
        "minItems": len(CRITERION_WEIGHTS), "maxItems": len(CRITERION_WEIGHTS)})


@dataclass(frozen=True)
class M2Result:
    reasons: list[Reason]  # not yet quote-validated
    outputs: list[CriterionResult]
    rules: float
    prompt_version: str
    model: str


def rules_score(text: str) -> float:
    """Phrase heuristic 0..1: sum of the weights of the matched rules (rules/m2.yaml)."""
    return min(1.0, sum(w for _, w, rx in _RULE_PATTERNS if rx.search(text)))


def llm_score(outputs: list[CriterionResult], valid: set[str]) -> float:
    """Weighted confidence of failed criteria whose quote survived validation."""
    return common_llm_score(outputs, valid, CRITERION_WEIGHTS)


def m2_gate_passed(text: str, config: dict[str, Any]) -> bool:
    """True when the rules score is high enough to spend an LLM call on this text (gate 0 = always)."""
    return rules_score(text) >= llm_gate(config, 2)


async def run_m2(llm: OllamaClient, text: str) -> M2Result:
    prompt = load_prompt(PROMPT_PATH)
    out = await llm.generate(prompt.text, text[:MAX_DOC_CHARS], M2Output)
    reasons = llm_reasons(out.criteria, CRITERION_WEIGHTS)  # one per criterion; no quote -> no reason
    return M2Result(reasons=reasons, outputs=out.criteria, rules=rules_score(text),
                    prompt_version=f"{prompt.version}+{RULES_VERSION}", model=llm.model)


async def m2_emb(doc_vector: list[float] | None, config: dict[str, Any]) -> float | None:
    """Similarity to the M2 anchors (misleading-ad phrases); None without a document vector."""
    return None if doc_vector is None else await emb_score(doc_vector, 2, config)


def score_m2(result: M2Result, valid_reasons: list[Reason], weights: dict[str, float],
             emb: float | None = None) -> float:
    valid = {r.criterion for r in valid_reasons}
    return combine(llm_score(result.outputs, valid), result.rules, emb, weights)
