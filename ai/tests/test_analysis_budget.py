import asyncio
import json
from typing import Any

import pytest

from app import analysis
from app.modules import m3
from app.modules.common import ModuleRun
from app.routing import Route


def test_long_quote_is_truncated_not_rejected() -> None:
    payload = {"criteria": [{"criterion": "paid_advisory_offer",
                             "verdict": "fail", "quote": "x" * 900 + "  ", "confidence": 0.9}]}
    out = m3.M3Output.model_validate_json(json.dumps(payload))
    assert len(out.criteria[0].quote) == 600


def test_quote_schema_keeps_max_length_hint() -> None:
    schema = m3.M3Output.model_json_schema()
    assert schema["$defs"]["CriterionResult"]["properties"]["quote"]["maxLength"] == 600


def test_crashing_module_keeps_other_results(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_one(module: int, *args: Any, **kwargs: Any) -> ModuleRun:
        if module == 1:
            raise RuntimeError("boom")
        return ModuleRun(module=module, finding=None)

    monkeypatch.setattr(analysis, "_run_one", fake_one)
    monkeypatch.setattr(analysis, "route_document",
                        lambda *a, **k: Route(modules=[1, 3], official_entity_id=None, m1_candidates=[]))
    _, runs = asyncio.run(analysis.run_modules(
        None, {}, {}, "t", "http://x", None, [], 1, None))  # type: ignore[arg-type]
    assert [r.module for r in runs] == [3]


def test_all_modules_crashing_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_one(module: int, *args: Any, **kwargs: Any) -> ModuleRun:
        raise RuntimeError("boom")

    monkeypatch.setattr(analysis, "_run_one", fake_one)
    monkeypatch.setattr(analysis, "route_document",
                        lambda *a, **k: Route(modules=[3], official_entity_id=None, m1_candidates=[]))
    with pytest.raises(RuntimeError):
        asyncio.run(analysis.run_modules(None, {}, {}, "t", "http://x", None, [], 1, None))  # type: ignore[arg-type]
