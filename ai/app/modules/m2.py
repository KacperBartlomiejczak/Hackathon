"""Module 2: risk information in advertising published by a registered firm itself."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field

from app.llm import OllamaClient
from app.models import Reason
from app.prompts import load_prompt
from app.scoring import combine

logger = logging.getLogger("ai.m2")

PROMPT_PATH = "m2-risk-info/system.md"
MAX_DOC_CHARS = 8000  # head of the document only; quotes are validated against the full text
LABEL = "risk_info_insufficient"

CriterionId = Literal[
    "risk_warning_present", "risk_prominence", "profit_risk_balance", "no_guaranteed_returns"
]

# Share of each criterion in the llm part of the score (sums to 1).
CRITERION_WEIGHTS: dict[str, float] = {
    "risk_warning_present": 0.35,
    "risk_prominence": 0.20,
    "profit_risk_balance": 0.25,
    "no_guaranteed_returns": 0.20,
}

_RULES = re.compile(
    r"gwarantowan\w+|pewn\w+ (?:zysk|zarob)\w*|bez ryzyka|zero ryzyka|bezpieczn\w+ inwestycj\w+"
    r"|zarabiaj\w*|\d+\s?% (?:miesięcznie|tygodniowo|rocznie)",
    re.IGNORECASE,
)


class CriterionResult(BaseModel):
    criterion: CriterionId
    verdict: Literal["pass", "fail", "unclear"]
    quote: str = Field(default="", max_length=600)
    confidence: float = Field(ge=0, le=1)


class M2Output(BaseModel):
    criteria: list[CriterionResult]


@dataclass(frozen=True)
class M2Result:
    reasons: list[Reason]  # not yet quote-validated
    outputs: list[CriterionResult]
    rules: float
    prompt_version: str
    model: str


def rules_score(text: str) -> float:
    """Cheap phrase heuristic 0..1 (distinct hits * 0.35)."""
    hits = {m.group().lower() for m in _RULES.finditer(text)}
    return min(1.0, 0.35 * len(hits))


def llm_score(outputs: list[CriterionResult], valid: set[str]) -> float:
    """Weighted confidence of failed criteria whose quote survived validation."""
    return sum(
        CRITERION_WEIGHTS[o.criterion] * o.confidence
        for o in outputs
        if o.verdict == "fail" and o.criterion in valid
    )


async def run_m2(llm: OllamaClient, text: str) -> M2Result:
    prompt = load_prompt(PROMPT_PATH)
    out = await llm.generate(prompt.text, text[:MAX_DOC_CHARS], M2Output)
    seen: set[str] = set()
    reasons: list[Reason] = []
    for c in out.criteria:
        if c.criterion in seen or not c.quote.strip():
            continue  # one verdict per criterion; no quote -> no reason
        seen.add(c.criterion)
        reasons.append(
            Reason(criterion=c.criterion, verdict=c.verdict, quote=c.quote.strip(),
                   weight=CRITERION_WEIGHTS[c.criterion])
        )
    return M2Result(reasons=reasons, outputs=out.criteria, rules=rules_score(text),
                    prompt_version=prompt.version, model=llm.model)


def score_m2(result: M2Result, valid_reasons: list[Reason], weights: dict[str, float]) -> float:
    valid = {r.criterion for r in valid_reasons}
    return combine(llm_score(result.outputs, valid), result.rules, None, weights)
