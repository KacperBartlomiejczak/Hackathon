"""Calibration metrics for /eval: stored finding scores vs. the hand-labelled gold set. No LLM calls."""
import csv
import logging
from dataclasses import dataclass
from pathlib import Path

import asyncpg

log = logging.getLogger(__name__)

GOLD_PATH = Path(__file__).resolve().parents[1] / "eval" / "gold.csv"


@dataclass(frozen=True)
class EvalResult:
    module: int
    threshold: float
    tp: int
    fp: int
    fn: int
    tn: int
    precision: float  # 0.0 when nothing is flagged
    recall: float  # 0.0 when the gold set has no positives
    total: int  # gold rows for this module
    missing_findings: int  # gold rows without a finding; scored as 0 (not flagged)


def parse_module(module: str | int) -> int:
    """'M1', 'm1' or 1 -> 1. Only modules 1..3 exist."""
    value = int(str(module).strip().upper().removeprefix("M"))
    if value not in (1, 2, 3):
        raise ValueError(f"unknown module {module!r}")
    return value


def load_gold(module: int, path: Path = GOLD_PATH) -> dict[int, bool]:
    """document_id -> label for one module. Empty dict for a header-only or missing file."""
    if not path.exists():
        log.warning("gold set %s does not exist", path)
        return {}
    gold: dict[int, bool] = {}
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if parse_module(row["module"]) != module:
                continue
            doc_id, label = int(row["document_id"]), row["label"].strip()
            if label not in ("0", "1"):
                raise ValueError(f"gold label must be 0 or 1, got {label!r} for document {doc_id}")
            if gold.setdefault(doc_id, label == "1") != (label == "1"):
                raise ValueError(f"conflicting gold labels for document {doc_id}, module {module}")
    return gold


def compute_metrics(
    module: int, threshold: float, gold: dict[int, bool], scores: dict[int, float]
) -> EvalResult:
    """Flagged means score >= threshold. A document without a score counts as not flagged."""
    tp = fp = fn = tn = 0
    for doc_id, positive in gold.items():
        flagged = scores.get(doc_id, 0.0) >= threshold
        if flagged and positive:
            tp += 1
        elif flagged:
            fp += 1
        elif positive:
            fn += 1
        else:
            tn += 1
    return EvalResult(
        module=module,
        threshold=threshold,
        tp=tp,
        fp=fp,
        fn=fn,
        tn=tn,
        precision=tp / (tp + fp) if tp + fp else 0.0,
        recall=tp / (tp + fn) if tp + fn else 0.0,
        total=len(gold),
        missing_findings=sum(1 for d in gold if d not in scores),
    )


async def evaluate(
    conn: asyncpg.Connection, module: str | int, threshold: float, gold_path: Path = GOLD_PATH
) -> EvalResult:
    """Metrics for `module` at `threshold` from gold.csv and the highest stored finding score per document."""
    if not 0.0 <= threshold <= 1.0:
        raise ValueError(f"threshold must be in [0, 1], got {threshold}")
    mod = parse_module(module)
    gold = load_gold(mod, gold_path)
    rows = (
        await conn.fetch(
            "SELECT document_id, max(score) AS score FROM findings "
            "WHERE module = $1 AND document_id = ANY($2::bigint[]) GROUP BY document_id",
            mod,
            list(gold),
        )
        if gold
        else []
    )
    result = compute_metrics(mod, threshold, gold, {r["document_id"]: float(r["score"]) for r in rows})
    if not gold:
        log.warning("eval module=%d: no gold rows, all metrics are zero", mod)
    elif result.missing_findings:
        log.warning(
            "eval module=%d: %d of %d gold documents have no finding",
            mod, result.missing_findings, result.total,
        )
    log.info(
        "eval module=%d threshold=%.2f tp=%d fp=%d fn=%d tn=%d precision=%.3f recall=%.3f",
        mod, threshold, result.tp, result.fp, result.fn, result.tn, result.precision, result.recall,
    )
    return result
