import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import main
from app.models import FindingCreate, Reason, risk_level


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
    monkeypatch.delenv("OLLAMA_BASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with TestClient(main.app) as client:
        r = client.get("/health")
    assert r.status_code == 503
    assert r.json() == {"status": "degraded", "ollama": "error", "postgres": "error"}


def test_stubs_not_implemented() -> None:
    with TestClient(main.app) as client:
        assert client.post("/analyze/1").status_code == 501
        assert client.post("/reanalyze?module=2").status_code == 501
        assert client.get("/eval?module=2&threshold=0.6").status_code == 501
        assert client.get("/eval?module=9&threshold=0.6").status_code == 422
