import asyncio
import io

import pytest
from botocore.exceptions import ClientError

from app.storage import StorageError, get_html


class FakeS3:
    def get_object(self, Bucket: str, Key: str) -> dict:  # noqa: N803
        if Key == "missing":
            raise ClientError({"Error": {"Code": "NoSuchKey", "Message": "x"}}, "GetObject")
        return {"Body": io.BytesIO(f"<p>{Bucket}/{Key}</p>".encode())}


def test_get_html(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("S3_BUCKET", "b")
    assert asyncio.run(get_html("raw/a.html", client=FakeS3())) == "<p>b/raw/a.html</p>"


def test_missing_key_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("S3_BUCKET", "b")
    with pytest.raises(StorageError):
        asyncio.run(get_html("missing", client=FakeS3()))


def test_missing_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("S3_ENDPOINT", raising=False)
    with pytest.raises(StorageError, match="S3_ENDPOINT"):
        asyncio.run(get_html("k"))
