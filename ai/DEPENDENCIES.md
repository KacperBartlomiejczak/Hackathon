# ai/ — dependencies

Checked on 2026-11-21 (PyPI metadata, `pip-audit`: no known vulnerabilities; transitive licenses: no GPL/AGPL).

| Package | Version | License | Purpose |
|---|---|---|---|
| fastapi | 0.165.0 | MIT | HTTP API |
| uvicorn[standard] | 0.54.0 | BSD-3-Clause | ASGI server |
| pydantic | 2.14.4 | MIT | models and validation |
| httpx | 0.28.1 | BSD-3-Clause | Ollama HTTP client |
| asyncpg | 0.32.0 | Apache-2.0 | PostgreSQL (instead of psycopg, which is LGPL-3.0) |
| boto3 | 1.44.9 | Apache-2.0 | S3 (SeaweedFS) |
| trafilatura | 2.3.1 | Apache-2.0 | text extraction (used by ai-data) |
| rapidfuzz | 3.14.6 | MIT | fuzzy quote matching |
| numpy | 2.5.5 | BSD-3-Clause (+ permissive) | vectors |
| pyyaml | 6.0.4 | MIT | config.yaml |
| ruff (dev) | 0.17.6 | MIT | lint/format |
| pytest (dev) | 9.2.0 | MIT | tests |
| pytest-asyncio (dev) | 1.5.0 | Apache-2.0 | async tests |

Transitive notes: certifi is MPL-2.0 (allowed).

| Image | Tag | License |
|---|---|---|
| python | 3.12.12-slim-bookworm | PSF |
| ghcr.io/astral-sh/uv | 0.9.15 | MIT/Apache-2.0 |

LLM and embedding model tags + licenses: to be added when chosen (OLLAMA_MODEL in .env).
