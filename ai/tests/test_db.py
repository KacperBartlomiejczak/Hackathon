import asyncio

import pytest

from app.db import DatabaseError, fetch_document, open_pool


class FakePool:
    async def fetchrow(self, query: str, doc_id: int):
        return {"id": doc_id, "html_key": "raw/x.html"} if doc_id == 1 else None


def test_open_pool_requires_dsn(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(DatabaseError):
        asyncio.run(open_pool())


def test_fetch_document() -> None:
    assert asyncio.run(fetch_document(FakePool(), 1))["html_key"] == "raw/x.html"  # type: ignore[arg-type]
    assert asyncio.run(fetch_document(FakePool(), 2)) is None  # type: ignore[arg-type]
