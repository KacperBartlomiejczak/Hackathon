import os
from collections.abc import AsyncIterator

import asyncpg
import pytest_asyncio

DSN = os.environ.get("TEST_DATABASE_URL", "postgresql://postgres:test@localhost:55432/postgres")

# Copy of the tables from docs/contracts.md used by ai-data code. Keep in sync with infra/db/.
DDL = """
CREATE EXTENSION IF NOT EXISTS vector;
DROP TABLE IF EXISTS findings, documents, entities CASCADE;
CREATE TABLE entities (
  id serial PRIMARY KEY, name text NOT NULL, aliases text[] DEFAULT '{}',
  type text NOT NULL CHECK (type IN ('investment_firm','foreign_firm','advertiser','finfluencer','advisory_unlicensed','unknown')),
  is_authorized boolean NOT NULL DEFAULT false, register_ref text, nip text,
  official_domains text[] DEFAULT '{}', social_handles text[] DEFAULT '{}'
);
CREATE TABLE documents (
  id bigserial PRIMARY KEY, url text NOT NULL, url_hash text NOT NULL UNIQUE,
  source_kind text NOT NULL DEFAULT 'web', text_clean text, content_hash text, simhash bigint,
  duplicate_of bigint REFERENCES documents(id), embedding vector(1024),
  status text NOT NULL DEFAULT 'fetched'
);
CREATE TABLE findings (
  id bigserial PRIMARY KEY, document_id bigint NOT NULL REFERENCES documents(id),
  module smallint NOT NULL CHECK (module IN (1,2,3)), score real NOT NULL CHECK (score BETWEEN 0 AND 1),
  risk_level text NOT NULL CHECK (risk_level IN ('low','medium','high')), label text NOT NULL,
  reasons jsonb NOT NULL, firm_entity_id int REFERENCES entities(id), advertiser_entity_id int REFERENCES entities(id),
  model text NOT NULL, prompt_version text NOT NULL, status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);
"""


@pytest_asyncio.fixture
async def conn() -> AsyncIterator[asyncpg.Connection]:
    try:
        c = await asyncpg.connect(DSN, timeout=3)
    except OSError:
        import pytest

        pytest.skip("test Postgres not reachable")
    await c.execute(DDL)
    yield c
    await c.close()
