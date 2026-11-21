import logging

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import main
from app.models import FindingCreate, Reason, risk_level


@pytest.mark.parametrize(
    ("raw", "expected", "ok"),
    [
        ("info", logging.INFO, True),
        ("INFO", logging.INFO, True),
        (" warn ", logging.WARNING, True),
        ("debug", logging.DEBUG, True),
        ("trace", logging.DEBUG, True),
        (None, logging.INFO, True),
        ("verbose", logging.INFO, False),
    ],
)
def test_resolve_log_level(raw: str | None, expected: int, ok: bool) -> None:
    assert main._resolve_log_level(raw) == (expected, ok)


def test_risk_level() -> None:
    assert risk_level(0.85, 0.6) == "high"
    assert risk_level(0.7, 0.6) == "medium"
    assert risk_level(0.3, 0.6) == "low"


def test_finding_requires_quote() -> None:
    with pytest.raises(ValidationError):
        FindingCreate(
            document_id=1,
            module=2,
            score=0.5,
            risk_level="medium",
            label="x",
            reasons=[],
            model="m",
            prompt_version="m2-v1",
        )


def test_finding_camel_case() -> None:
    f = FindingCreate(
        documentId=1,
        module=2,
        score=0.9,
        riskLevel="high",
        label="x",
        reasons=[Reason(criterion="c", verdict="fail", quote="q", weight=0.4)],
        model="m",
        promptVersion="m2-v1",
    )
    assert f.model_dump(by_alias=True)["riskLevel"] == "high"


def test_health_degraded_without_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OLLAMA_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with TestClient(main.app) as client:
        r = client.get("/health")
    assert r.status_code == 503
    assert r.json() == {"status": "degraded", "ollama": "error", "postgres": "error"}


def test_unconfigured_and_stubs() -> None:
    with TestClient(main.app) as client:
        assert client.post("/analyze/1").status_code == 503  # no DB / LLM configured
        assert client.post("/reanalyze?module=2").status_code == 503  # no DB / LLM configured
        assert client.get("/eval?module=2&threshold=0.6").status_code == 503  # no DB
        assert client.get("/eval?module=9&threshold=0.6").status_code == 422


@pytest.fixture
def token_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_REQUIRE_TOKEN", "true")
    monkeypatch.setenv("INTERNAL_TOKEN", "secret-token")


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/analyze/1"),
        ("post", "/analyze-text"),
        ("post", "/reanalyze?module=2"),
        ("get", "/eval?module=2&threshold=0.6"),
    ],
)
def test_internal_endpoints_reject_missing_or_wrong_token(token_auth: None, method: str, path: str) -> None:
    with TestClient(main.app) as client:
        assert client.request(method, path).status_code == 401
        assert client.request(method, path, headers={"X-Internal-Token": "nope"}).status_code == 401


def test_valid_token_passes_guard(token_auth: None) -> None:
    with TestClient(main.app) as client:
        r = client.post("/reanalyze?module=2", headers={"X-Internal-Token": "secret-token"})
    assert r.status_code == 503  # reached the handler (no DB / LLM in the test env)


def test_health_stays_open_with_auth_enabled(token_auth: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OLLAMA_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with TestClient(main.app) as client:
        assert client.get("/health").status_code == 503  # degraded, not 401


def test_auth_fails_closed_without_configured_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_REQUIRE_TOKEN", "true")
    monkeypatch.delenv("INTERNAL_TOKEN", raising=False)
    with TestClient(main.app) as client:
        assert client.post("/reanalyze?module=2", headers={"X-Internal-Token": ""}).status_code == 503


def test_auth_disabled_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AI_REQUIRE_TOKEN", raising=False)
    with TestClient(main.app) as client:
        assert client.post("/reanalyze?module=2").status_code == 503
