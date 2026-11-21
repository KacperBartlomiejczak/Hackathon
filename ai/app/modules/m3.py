"""Module 3: shadow advisory — entity outside the KNF register offering advice / portfolio management.

Hybrid: phrase rules (rules/m3.yaml) + embedding similarity to anchors + LLM judgement.
"""

from __future__ import annotations

import logging
import re
import time
from functools import lru_cache
from typing import Any, Literal

import yaml
from pydantic import BaseModel, Field

from app.llm import OllamaClient
from app.models import FindingCreate, Reason, high_threshold, risk_level
from app.modules.common import MAX_DOC_CHARS, RULES_DIR, ModuleRun, emb_score, llm_reasons, llm_score
from app.modules.quotes import validate_reasons
from app.prompts import load_prompt
from app.scoring import combine

logger = logging.getLogger("ai.m3")

PROMPT_PATH = "m3-shadow-advisory/system.md"
LABEL = "shadow_advisory"
SNIPPET_MAX = 300

CRITERION_WEIGHTS: dict[str, float] = {
    "individual_recommendations": 0.4, "portfolio_management": 0.35, "paid_advisory_offer": 0.25,
}


class CriterionResult(BaseModel):
    criterion: Literal["individual_recommendations", "portfolio_management", "paid_advisory_offer"]
    verdict: Literal["pass", "fail", "unclear"]
    quote: str = Field(max_length=600)
    confidence: float = Field(ge=0, le=1)


class M3Output(BaseModel):
    criteria: list[CriterionResult]


@lru_cache(maxsize=1)
def _load_rules() -> tuple[str, list[tuple[str, float, re.Pattern[str]]]]:
    data = yaml.safe_load((RULES_DIR / "m3.yaml").read_text(encoding="utf-8"))
    rules = [(r["id"], float(r["weight"]), re.compile(r["pattern"], re.IGNORECASE)) for r in data["rules"]]
    return data["version"], rules


def rules_hits(text: str) -> tuple[float, list[Reason]]:
    """(rules score 0..1, one reason per matched rule with the matching sentence as the quote)."""
    _, rules = _load_rules()
    total = 0.0
    reasons: list[Reason] = []
    for rule_id, weight, rx in rules:
        m = rx.search(text)
        if m is None:
            continue
        total += weight
        a = max(text.rfind(c, 0, m.start()) for c in ".!?\n") + 1
        ends = [i for c in ".!?\n" if (i := text.find(c, m.end())) != -1]
        b = min(ends) + 1 if ends else len(text)
        quote = text[a:b].strip()[:SNIPPET_MAX] or m.group()
        reasons.append(Reason(criterion=f"rule:{rule_id}", verdict="fail", quote=quote, weight=weight))
    return min(1.0, total), reasons


async def run_m3(
    llm: OllamaClient, config: dict[str, Any], text: str, doc_vector: list[float] | None,
    document_id: int, threshold: float, weights: dict[str, float],
) -> ModuleRun:
    ms: dict[str, int] = {}
    rules, rule_reasons = rules_hits(text)
    t = time.monotonic()
    prompt = load_prompt(PROMPT_PATH)
    out = await llm.generate(prompt.text, text[:MAX_DOC_CHARS], M3Output)
    ms["llm"] = int((time.monotonic() - t) * 1000)

    reasons = validate_reasons(llm_reasons(out.criteria, CRITERION_WEIGHTS) + rule_reasons, text)
    run = ModuleRun(module=3, finding=None, rules=rules, threshold=threshold, weights=weights, ms=ms)
    if not reasons:
        return run
    t = time.monotonic()
    run.emb = await emb_score(doc_vector, 3, config) if doc_vector is not None else None
    ms["emb"] = int((time.monotonic() - t) * 1000)
    run.llm = llm_score(out.criteria, {r.criterion for r in reasons}, CRITERION_WEIGHTS)
    run.score = combine(run.llm, run.rules, run.emb, weights)
    run.finding = FindingCreate(
        document_id=document_id, module=3, score=run.score,
        risk_level=risk_level(run.score, threshold, high_threshold(config)),
        label=LABEL, reasons=reasons, model=llm.model, prompt_version=f"{prompt.version}+{_load_rules()[0]}",
    )
    return run
