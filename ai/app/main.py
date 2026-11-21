import logging
import time

import httpx
from fastapi import FastAPI

from app.config import get_settings
from app.logging_setup import setup_logging
from app.models import HealthResponse

setup_logging()
log = logging.getLogger("ai")

app = FastAPI(title="InvestWatch AI", version="0.1.0")


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    settings = get_settings()
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.ollama_url}/api/tags")
            resp.raise_for_status()
            models = [m["name"] for m in resp.json().get("models", [])]
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        log.warning("health ollama=down error=%s", exc)
        return HealthResponse(status="degraded", ollama="down")
    log.info(
        "health ollama=ok models=%d took_ms=%.0f",
        len(models),
        (time.perf_counter() - started) * 1000,
    )
    return HealthResponse(status="ok", ollama="ok", models=models)
