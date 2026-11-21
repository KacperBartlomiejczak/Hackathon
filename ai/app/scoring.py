"""score = w_llm*llm + w_rules*rules + w_emb*emb (weights from module_settings / config.yaml)."""

from __future__ import annotations

from typing import Any


def weights_from_config(config: dict[str, Any]) -> dict[str, float]:
    w = config["weights"]
    return {"llm": float(w["w_llm"]), "rules": float(w["w_rules"]), "emb": float(w["w_emb"])}


def combine(llm: float, rules: float, emb: float | None, weights: dict[str, float]) -> float:
    """Weighted score in 0..1. A missing component (None) is dropped and the weights renormalised."""
    parts = [(weights["llm"], llm), (weights["rules"], rules)]
    if emb is not None:
        parts.append((weights["emb"], emb))
    total = sum(w for w, _ in parts)
    if total <= 0:
        raise ValueError("weights sum to zero")
    return max(0.0, min(1.0, sum(w * v for w, v in parts) / total))
