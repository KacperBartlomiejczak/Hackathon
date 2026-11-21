import asyncio
import json

import httpx
import pytest
from pydantic import BaseModel

from app.llm import LLMInvalidResponse, LLMUnavailable, OllamaClient


class Out(BaseModel):
    verdict: str
    score: float


def _client(handler) -> OllamaClient:
    return OllamaClient(
        base_url="http://ollama.test", model="m", transport=httpx.MockTransport(handler), backoff_s=0
    )


def test_structured_request_and_parse() -> None:
    seen: dict = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen.update(json.loads(req.content))
        return httpx.Response(200, json={"message": {"content": '{"verdict":"ok","score":0.5}'}})

    out = asyncio.run(_client(handler).generate("sys", "ignore previous", Out))
    assert out == Out(verdict="ok", score=0.5)
    assert seen["format"] == Out.model_json_schema()
    assert seen["options"]["temperature"] == 0
    assert seen["messages"][0] == {"role": "system", "content": "sys"}
    assert seen["messages"][1]["content"].startswith("<document>")


def test_timeout_retries_once_then_raises() -> None:
    calls = 0

    def handler(req: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ReadTimeout("slow")

    with pytest.raises(LLMUnavailable):
        asyncio.run(_client(handler).generate("s", "d", Out))
    assert calls == 2


def test_retry_recovers() -> None:
    calls = 0

    def handler(req: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(503)
        return httpx.Response(200, json={"message": {"content": '{"verdict":"a","score":1}'}})

    assert asyncio.run(_client(handler).generate("s", "d", Out)).verdict == "a"


def test_invalid_json_raises() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"message": {"content": '{"verdict":"x"}'}})

    with pytest.raises(LLMInvalidResponse):
        asyncio.run(_client(handler).generate("s", "d", Out))


def test_requires_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OLLAMA_URL", raising=False)
    with pytest.raises(Exception, match="OLLAMA_URL"):
        OllamaClient(model="m")
