import httpx
import pytest
from fastapi.testclient import TestClient

from app import main


class _FakeClient:
    def __init__(self, response: httpx.Response | None = None, error: Exception | None = None):
        self._response = response
        self._error = error

    def __call__(self, *args: object, **kwargs: object) -> "_FakeClient":
        return self

    async def __aenter__(self) -> "_FakeClient":
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def get(self, url: str) -> httpx.Response:
        if self._error:
            raise self._error
        assert self._response is not None
        return self._response


def test_health_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    resp = httpx.Response(
        200,
        json={"models": [{"name": "bge-m3:latest"}]},
        request=httpx.Request("GET", "http://ollama/api/tags"),
    )
    monkeypatch.setattr(main.httpx, "AsyncClient", _FakeClient(response=resp))
    body = TestClient(main.app).get("/health").json()
    assert body == {"status": "ok", "ollama": "ok", "models": ["bge-m3:latest"]}


def test_health_ollama_down(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main.httpx, "AsyncClient", _FakeClient(error=httpx.ConnectError("boom")))
    body = TestClient(main.app).get("/health").json()
    assert body["ollama"] == "down"
    assert body["status"] == "degraded"
