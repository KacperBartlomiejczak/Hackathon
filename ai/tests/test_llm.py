import asyncio
import json
import time

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


def test_timeout_is_not_retried() -> None:
    calls = 0

    def handler(req: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ReadTimeout("slow")

    with pytest.raises(LLMUnavailable):
        asyncio.run(_client(handler).generate("s", "d", Out))
    assert calls == 1


def test_connect_error_is_retried() -> None:
    calls = 0

    def handler(req: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ConnectError("down")

    with pytest.raises(LLMUnavailable):
        asyncio.run(_client(handler).generate("s", "d", Out))
    assert calls == 2


def test_queue_wait_not_counted_in_timeout() -> None:
    """Two concurrent calls, one slot, each 0.3 s: they are serialized (queue wait is not a timeout)."""

    async def handler(req: httpx.Request) -> httpx.Response:
        await asyncio.sleep(0.3)
        return httpx.Response(200, json={"message": {"content": '{"verdict":"a","score":1}'}})

    async def run() -> list[Out]:
        # real per-request timeout enforcement needs a real transport; MockTransport has none, so the
        # slot ordering is what is asserted: calls must not overlap.
        client = OllamaClient(base_url="http://ollama.test", model="m",
                              transport=httpx.MockTransport(handler), backoff_s=0, timeout_s=0.5,
                              max_concurrency=1)
        return list(await asyncio.gather(client.generate("s", "d", Out), client.generate("s", "d", Out)))

    started = time.monotonic()
    results = asyncio.run(run())
    assert [r.verdict for r in results] == ["a", "a"]
    assert time.monotonic() - started >= 0.6  # serialized


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
