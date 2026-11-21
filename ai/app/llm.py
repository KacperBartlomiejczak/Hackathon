"""Ollama chat client with structured outputs (JSON Schema from Pydantic).

Never returns a default or invented result: any failure raises LLMError.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

logger = logging.getLogger("ai.llm")

TIMEOUT_S = 60.0
RETRIES = 1
BACKOFF_S = 1.0

T = TypeVar("T", bound=BaseModel)


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
    ) -> None:
        self.base_url = (base_url or os.getenv("OLLAMA_URL") or "").rstrip("/")
        self.model = model or os.getenv("OLLAMA_LLM_MODEL") or ""
        if not self.base_url:
            raise LLMError("OLLAMA_URL not set")
        if not self.model:
            raise LLMError("OLLAMA_LLM_MODEL not set")
        self._backoff_s = backoff_s
        self._client = httpx.AsyncClient(timeout=TIMEOUT_S, transport=transport)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def generate(self, system: str, document: str, schema: type[T]) -> T:
        """Run the model; `system` is the instruction, `document` is untrusted data."""
        payload = {
            "model": self.model,
            "stream": False,
            "format": schema.model_json_schema(),
            "options": {"temperature": 0},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": f"<document>\n{document}\n</document>"},
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

    async def _post_with_retry(self, payload: dict[str, object]) -> str:
        last: Exception | None = None
        for attempt in range(RETRIES + 1):
            try:
                resp = await self._client.post(f"{self.base_url}/api/chat", json=payload)
                if resp.status_code >= 500:
                    raise httpx.HTTPStatusError("server error", request=resp.request, response=resp)
                resp.raise_for_status()
                data = resp.json()
                content = data["message"]["content"]
                if not isinstance(content, str):
                    raise LLMInvalidResponse("message.content is not a string")
                return content
            except (httpx.TransportError, httpx.HTTPStatusError) as exc:
                last = exc
                if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code < 500:
                    break  # 4xx will not get better on retry
                logger.warning("llm attempt %d failed: %s", attempt + 1, exc)
                if attempt < RETRIES:
                    await asyncio.sleep(self._backoff_s)
            except (KeyError, TypeError, ValueError) as exc:
                raise LLMInvalidResponse(f"malformed ollama envelope: {exc}") from exc
        raise LLMUnavailable(f"ollama unavailable: {last}") from last
