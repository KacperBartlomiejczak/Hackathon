"""DB-free core of the analysis: route -> run modules. Shared by the pipeline and POST /analyze-text."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Sequence
from typing import Any

from app.llm import LLMError, LLMUnavailable, OllamaClient
from app.models import FindingCreate, high_threshold, risk_level
from app.modules.common import ModuleRun, llm_gate
from app.modules.m1 import run_m1
from app.modules.m2 import LABEL as M2_LABEL
from app.modules.m2 import llm_score, m2_emb, m2_gate_passed, rules_score, run_m2, score_m2
from app.modules.m3 import run_m3
from app.modules.quotes import validate_reasons
from app.preprocess.entity_match import Entity
from app.routing import Route, route_document
from app.scoring import weights_from_config

logger = logging.getLogger("ai.analysis")

DEFAULT_BUDGET_S = 540.0  # below the collector /analyze timeout (600 s)

Settings = dict[int, tuple[float, dict[str, float]]]  # module -> (threshold, weights)


def default_settings(config: dict[str, Any]) -> Settings:
    w = weights_from_config(config)
    return {m: (float(config["thresholds"][f"m{m}"]), dict(w)) for m in (1, 2, 3)}


async def _run_m2(
    llm: OllamaClient, config: dict[str, Any], text: str, document_id: int, firm_entity_id: int | None,
    threshold: float, weights: dict[str, float], doc_vector: list[float] | None,
) -> ModuleRun:
    if not m2_gate_passed(text, config):
        rules = rules_score(text)
        logger.info("module=2 llm skipped gate rules=%.2f gate=%.2f document_id=%s",
                    rules, llm_gate(config, 2), document_id)
        return ModuleRun(module=2, finding=None, rules=rules, threshold=threshold, weights=weights)
    t = time.monotonic()
    res = await run_m2(llm, text)
    run = ModuleRun(module=2, finding=None, rules=res.rules, threshold=threshold, weights=weights,
                    ms={"llm": int((time.monotonic() - t) * 1000)})
    valid = validate_reasons(res.reasons, text)
    if not valid:
        logger.info("analyze document_id=%s module=2 no valid quotes, no finding", document_id)
        return run
    run.emb = await m2_emb(doc_vector, config)  # None without a document vector: w_emb dropped
    run.llm = llm_score(res.outputs, {r.criterion for r in valid})
    run.score = score_m2(res, valid, weights, run.emb)
    run.finding = FindingCreate(
        document_id=document_id, module=2, score=run.score,
        risk_level=risk_level(run.score, threshold, high_threshold(config)),
        label=M2_LABEL, reasons=valid, firm_entity_id=firm_entity_id,
        model=res.model, prompt_version=res.prompt_version,
    )
    return run


async def _run_one(
    module: int, llm: OllamaClient, config: dict[str, Any], settings: Settings, text: str,
    route: Route, document_id: int, doc_vector: list[float] | None,
) -> ModuleRun:
    threshold, weights = settings[module]
    started = time.monotonic()
    if module == 2:
        run = await _run_m2(llm, config, text, document_id, route.official_entity_id, threshold, weights,
                            doc_vector)
    elif module == 1:
        run = await run_m1(
            llm, config, text, doc_vector, route.m1_candidates, document_id, threshold, weights)
    else:
        run = await run_m3(llm, config, text, doc_vector, document_id, threshold, weights)
    logger.info("analyze document_id=%s module=%d score=%.3f llm=%.2f rules=%.2f emb=%s ms=%d",
                document_id, module, run.score, run.llm, run.rules,
                "-" if run.emb is None else f"{run.emb:.2f}", (time.monotonic() - started) * 1000)
    return run


async def run_modules(
    llm: OllamaClient, config: dict[str, Any], settings: Settings, text: str, url: str,
    author_handle: str | None, entities: Sequence[Entity], document_id: int, doc_vector: list[float] | None,
    only_module: int | None = None,
) -> tuple[Route, list[ModuleRun]]:
    """Run the routed modules concurrently, within `analysis.budget_s`.

    A module that fails or misses the budget is logged and left out of the result (never a made-up
    score); the others are kept. If nothing finished, the first failure is raised (LLMError), so the
    document ends up `failed`
    (a non-LLM crash is raised as is). `only_module` restricts the run to one module (used by /reanalyze).
    """
    route = route_document(text, url, author_handle, entities, document_id)
    if only_module is not None:
        route.modules = [m for m in route.modules if m == only_module]
    logger.info("analyze document_id=%s route=%s", document_id, route.modules)
    budget_s = float(config.get("analysis", {}).get("budget_s", DEFAULT_BUDGET_S))
    tasks = {
        module: asyncio.create_task(
            _run_one(module, llm, config, settings, text, route, document_id, doc_vector))
        for module in route.modules
    }
    if tasks:
        await asyncio.wait(tasks.values(), timeout=budget_s)
    runs: list[ModuleRun] = []
    first_error: BaseException | None = None
    for module, task in tasks.items():
        if not task.done():
            task.cancel()
            logger.error("analyze document_id=%s module=%d over budget budget_s=%.0f partial=true",
                         document_id, module, budget_s)
            first_error = first_error or LLMUnavailable(f"module {module} exceeded budget {budget_s:.0f}s")
        elif (exc := task.exception()) is not None:
            if isinstance(exc, LLMError):
                logger.error("analyze document_id=%s module=%d failed partial=true error=%s",
                             document_id, module, exc)
            else:  # a bug in one module must not take the others down
                logger.error("analyze document_id=%s module=%d crashed partial=true", document_id, module,
                             exc_info=exc)
            first_error = first_error or exc
        else:
            runs.append(task.result())
    if tasks and not runs and first_error is not None:
        raise first_error
    return route, runs
