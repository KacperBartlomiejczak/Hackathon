"""Ollama chat client with structured outputs (JSON Schema from Pydantic).

Never returns a default or invented result: any failure raises LLMError.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

logger = logging.getLogger("ai.llm")

TIMEOUT_S = 60.0
RETRIES = 1
BACKOFF_S = 1.0
KEEP_ALIVE = "30m"  # keep the model resident between documents; a cold load alone can take > 60 s
WARMUP_TIMEOUT_S = 300.0

T = TypeVar("T", bound=BaseModel)

_DOC_TAG = re.compile(r"</?\s*document\s*>", re.IGNORECASE)


def neutralize_delimiters(text: str) -> str:
    """Page text must not be able to close/open our <document> wrapper (prompt-injection break-out)."""
    return _DOC_TAG.sub(lambda m: m.group().replace("<", "‹").replace(">", "›"), text)


class LLMError(RuntimeError):
    """Base class for LLM failures."""


class LLMUnavailable(LLMError):
    """Network error, timeout or server error after retries."""


class LLMInvalidResponse(LLMError):
    """Response did not match the requested schema."""


class OllamaClient:
    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        backoff_s: float = BACKOFF_S,
        timeout_s: float = TIMEOUT_S,
        retries: int = RETRIES,
        max_concurrency: int = 1,
    ) -> None:
        self.base_url = (base_url or os.getenv("OLLAMA_URL") or "").rstrip("/")
        self.model = model or os.getenv("OLLAMA_LLM_MODEL") or ""
        if not self.base_url:
            raise LLMError("OLLAMA_URL not set")
        if not self.model:
            raise LLMError("OLLAMA_LLM_MODEL not set")
        self._backoff_s = backoff_s
        self._retries = retries
        self._client = httpx.AsyncClient(timeout=timeout_s, transport=transport)
        # Ollama (OLLAMA_NUM_PARALLEL) serves N chats at once; more would only queue inside Ollama and
        # burn the httpx timeout while waiting. Queue here instead: the timeout starts after the slot.
        self._slots = asyncio.Semaphore(max(1, max_concurrency))

    async def aclose(self) -> None:
        await self._client.aclose()

    async def warmup(self) -> None:
        """Load the model into memory (best effort, long timeout). Failure is logged, never raised.

        Bypasses the semaphore on purpose: it runs once at startup, before any document arrives.
        """
        started = time.monotonic()
        payload = {
            "model": self.model, "stream": False, "keep_alive": KEEP_ALIVE,
            "options": {"num_predict": 1},
            "messages": [{"role": "user", "content": "ok"}],
        }
        try:
            resp = await self._client.post(
                f"{self.base_url}/api/chat", json=payload, timeout=WARMUP_TIMEOUT_S
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("llm warmup failed model=%s: %r", self.model, exc)
            return
        logger.info("llm warmup ok model=%s ms=%d", self.model, (time.monotonic() - started) * 1000)

    async def generate(self, system: str, document: str, schema: type[T]) -> T:
        """Run the model; `system` is the instruction, `document` is untrusted data."""
        payload = {
            "model": self.model,
            "stream": False,
            "format": schema.model_json_schema(),
            "keep_alive": KEEP_ALIVE,
            "options": {"temperature": 0},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": f"<document>\n{neutralize_delimiters(document)}\n</document>"},
            ],
        }
        started = time.monotonic()
        content = await self._post_with_retry(payload)
        try:
            result = schema.model_validate_json(content)
        except ValidationError as exc:
            logger.error("llm invalid response model=%s schema=%s", self.model, schema.__name__)
            raise LLMInvalidResponse(f"response does not match {schema.__name__}: {exc}") from exc
        logger.info("llm ok model=%s schema=%s ms=%d", self.model, schema.__name__,
                    (time.monotonic() - started) * 1000)
        return result

    async def _post_once(self, payload: dict[str, object]) -> httpx.Response:
        """One chat call holding an Ollama slot; the httpx timeout starts only after the slot is taken."""
        queued = time.monotonic()
        async with self._slots:
            wait_ms = int((time.monotonic() - queued) * 1000)
            if wait_ms > 100:
                logger.info("llm queue wait model=%s ms=%d", self.model, wait_ms)
            return await self._client.post(f"{self.base_url}/api/chat", json=payload)

    async def _post_with_retry(self, payload: dict[str, object]) -> str:
        """Retries connect errors and 5xx; the backoff sleep happens outside the slot."""
        last: Exception | None = None
        for attempt in range(self._retries + 1):
            try:
                resp = await self._post_once(payload)
                if resp.status_code >= 500:
                    raise httpx.HTTPStatusError("server error", request=resp.request, response=resp)
                resp.raise_for_status()
                data = resp.json()
                content = data["message"]["content"]
                if not isinstance(content, str):
                    raise LLMInvalidResponse("message.content is not a string")
                return content
            except httpx.TimeoutException as exc:
                # The model was still computing; a retry would only double the load on a CPU box.
                logger.error("llm timeout (no retry): %r", exc)
                raise LLMUnavailable(f"ollama timeout: {exc!r}") from exc
            except (httpx.TransportError, httpx.HTTPStatusError) as exc:
                last = exc
                if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code < 500:
                    break  # 4xx will not get better on retry
                logger.warning("llm attempt %d failed: %r", attempt + 1, exc)
                if attempt < self._retries:
                    await asyncio.sleep(self._backoff_s)
            except (KeyError, TypeError, ValueError) as exc:
                raise LLMInvalidResponse(f"malformed ollama envelope: {exc}") from exc
        raise LLMUnavailable(f"ollama unavailable: {last!r}") from last
