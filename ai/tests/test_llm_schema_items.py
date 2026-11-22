"""The LLM JSON schema must force one entry per criterion (an empty list made llm = 0)."""

import pytest

from app.modules import m1, m2, m3


@pytest.mark.parametrize("module", [m1, m2, m3])
def test_criteria_schema_requires_every_criterion(module) -> None:
    output = {m1: m1.M1Output, m2: m2.M2Output, m3: m3.M3Output}[module]
    criteria = output.model_json_schema()["properties"]["criteria"]
    n = len(module.CRITERION_WEIGHTS)
    assert criteria["minItems"] == n
    assert criteria["maxItems"] == n


def test_partial_list_still_validates() -> None:
    # Validation stays lenient so a model that skips one criterion does not fail the whole document.
    out = m3.M3Output.model_validate({"criteria": [
        {"criterion": "portfolio_management", "verdict": "fail", "quote": "x", "confidence": 0.5}]})
    assert len(out.criteria) == 1
