"""Calibration metrics for /eval: stored finding scores vs. the hand-labelled gold set. No LLM calls."""
import csv
import hashlib
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


def url_hash(url: str) -> str:
    """Same key the collector stores in documents.url_hash (sha256 of the raw URL)."""
    return hashlib.sha256(url.encode()).hexdigest()


def load_gold(module: int, path: Path = GOLD_PATH) -> dict[str, bool]:
    """url -> label for one module. Empty dict for a header-only or missing file."""
    if not path.exists():
        log.warning("gold set %s does not exist", path)
        return {}
    gold: dict[str, bool] = {}
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if parse_module(row["module"]) != module:
                continue
            url, label = row["url"].strip(), row["label"].strip()
            if label not in ("0", "1"):
                raise ValueError(f"gold label must be 0 or 1, got {label!r} for {url}")
            if gold.setdefault(url, label == "1") != (label == "1"):
                raise ValueError(f"conflicting gold labels for {url}, module {module}")
    return gold


def compute_metrics[K](
    module: int, threshold: float, gold: dict[K, bool], scores: dict[K, float]
) -> EvalResult:
    """Flagged means score >= threshold. A document without a score counts as not flagged."""
    tp = fp = fn = tn = 0
    for key, positive in gold.items():
        flagged = scores.get(key, 0.0) >= threshold
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
    """Metrics for `module` at `threshold` from gold.csv and the highest stored finding score per document.

    Gold rows are matched to documents by url_hash, so labels survive a re-seed of the database.
    """
    if not 0.0 <= threshold <= 1.0:
        raise ValueError(f"threshold must be in [0, 1], got {threshold}")
    mod = parse_module(module)
    gold = load_gold(mod, gold_path)
    by_hash = {url_hash(u): u for u in gold}
    rows = (
        await conn.fetch(
            "SELECT d.url_hash, max(f.score) AS score FROM findings f "
            "JOIN documents d ON d.id = f.document_id "
            "WHERE f.module = $1 AND d.url_hash = ANY($2::text[]) GROUP BY d.url_hash",
            mod,
            list(by_hash),
        )
        if gold
        else []
    )
    result = compute_metrics(mod, threshold, gold, {by_hash[r["url_hash"]]: float(r["score"]) for r in rows})
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
