"""Module 1: registered firm mentioned/promoted by a third party (finfluencer, affiliate, impersonator)."""

from __future__ import annotations

import logging
import time
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.llm import OllamaClient
from app.models import FindingCreate, Reason, high_threshold, risk_level
from app.modules.common import MAX_DOC_CHARS, ModuleRun, emb_score, llm_reasons, llm_score
from app.modules.quotes import validate_reasons
from app.preprocess.entity_match import M1Candidate
from app.prompts import load_prompt
from app.scoring import combine

logger = logging.getLogger("ai.m1")

PROMPT_PATH = "m1-third-party/system.md"
LABEL = "third_party_promotion"

CRITERION_WEIGHTS: dict[str, float] = {"promotes_firm": 0.5, "profit_promises": 0.3, "impersonation": 0.2}
_VERDICT_MAP = {"detected": "fail", "unverified": "unclear"}  # matcher vocabulary -> contracts.md verdicts


class CriterionResult(BaseModel):
    criterion: Literal["promotes_firm", "profit_promises", "impersonation"]
    verdict: Literal["pass", "fail", "unclear"]
    quote: str = Field(max_length=600)
    confidence: float = Field(ge=0, le=1)


class M1Output(BaseModel):
    criteria: list[CriterionResult]


def best_candidate(candidates: list[M1Candidate]) -> M1Candidate:
    """One finding per (document, module): keep the candidate with the strongest rule signal."""
    return max(candidates, key=lambda c: c.rules_score)


def _matcher_reasons(c: M1Candidate) -> list[Reason]:
    return [
        Reason(criterion=r["criterion"], verdict=_VERDICT_MAP.get(r["verdict"], "unclear"),  # type: ignore[arg-type]
               quote=r["quote"], weight=r["weight"])
        for r in c.reasons if r.get("quote")
    ]


async def run_m1(
    llm: OllamaClient, config: dict[str, Any], text: str, doc_vector: list[float] | None,
    candidates: list[M1Candidate], document_id: int, threshold: float, weights: dict[str, float],
) -> ModuleRun:
    cand = best_candidate(candidates)
    ms: dict[str, int] = {}
    t = time.monotonic()
    prompt = load_prompt(PROMPT_PATH)
    out = await llm.generate(prompt.text, text[:MAX_DOC_CHARS], M1Output)
    ms["llm"] = int((time.monotonic() - t) * 1000)

    reasons = validate_reasons(_matcher_reasons(cand) + llm_reasons(out.criteria, CRITERION_WEIGHTS), text)
    run = ModuleRun(module=1, finding=None, rules=cand.rules_score, threshold=threshold,
                    weights=weights, ms=ms)
    if not reasons:
        return run
    t = time.monotonic()
    run.emb = await emb_score(doc_vector, 1, config) if doc_vector is not None else None
    ms["emb"] = int((time.monotonic() - t) * 1000)
    run.llm = llm_score(out.criteria, {r.criterion for r in reasons}, CRITERION_WEIGHTS)
    run.score = combine(run.llm, run.rules, run.emb, weights)
    run.finding = FindingCreate(
        document_id=document_id, module=1, score=run.score,
        risk_level=risk_level(run.score, threshold, high_threshold(config)),
        label=LABEL, reasons=reasons, firm_entity_id=cand.firm_entity_id,
        advertiser_entity_id=cand.advertiser_entity_id, model=llm.model, prompt_version=prompt.version,
    )
    return run
