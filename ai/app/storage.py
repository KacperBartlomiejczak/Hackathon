"""Object storage access (S3 API: SeaweedFS / MinIO / AWS) via boto3."""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger("ai.storage")

_REQUIRED_ENV = ("S3_ENDPOINT", "S3_ACCESS_KEY", "S3_SECRET_KEY", "S3_BUCKET")


class StorageError(RuntimeError):
    """Storage is misconfigured or the object could not be read."""


def make_client() -> Any:
    missing = [name for name in _REQUIRED_ENV if not os.getenv(name)]
    if missing:
        raise StorageError(f"missing env: {', '.join(missing)}")
    return boto3.client(
        "s3",
        endpoint_url=os.environ["S3_ENDPOINT"],
        aws_access_key_id=os.environ["S3_ACCESS_KEY"],
        aws_secret_access_key=os.environ["S3_SECRET_KEY"],
        region_name=os.getenv("S3_REGION", "us-east-1"),
        config=Config(
            s3={"addressing_style": "path"},
            connect_timeout=5,
            read_timeout=30,
            retries={"max_attempts": 2},
        ),
    )


def _get_html_sync(client: Any, bucket: str, key: str) -> str:
    try:
        obj = client.get_object(Bucket=bucket, Key=key)
        body: bytes = obj["Body"].read()
    except (ClientError, BotoCoreError) as exc:
        raise StorageError(f"cannot read s3://{bucket}/{key}: {exc}") from exc
    return body.decode("utf-8", errors="replace")


async def get_html(key: str, client: Any | None = None) -> str:
    """Download raw HTML stored under `key` (documents.html_key)."""
    if not key:
        raise StorageError("empty html_key")
    s3 = client if client is not None else make_client()
    bucket = os.environ.get("S3_BUCKET", "")
    if not bucket:
        raise StorageError("missing env: S3_BUCKET")
    html = await asyncio.to_thread(_get_html_sync, s3, bucket, key)
    logger.info("fetched html key=%s bytes=%d", key, len(html))
    return html
