# ai/ — dependencies

Versions resolved with `exclude-newer = 2026-11-07` (releases older than ~2 weeks). Checked on 2026-11-21 (PyPI metadata, `pip-audit`: no known vulnerabilities; transitive licenses: no GPL/AGPL).

| Package | Version | License | Purpose |
|---|---|---|---|
| fastapi | 0.162.0 | MIT | HTTP API |
| uvicorn[standard] | 0.54.0 | BSD-3-Clause | ASGI server |
| pydantic | 2.14.3 | MIT | models and validation |
| httpx | 0.28.1 | BSD-3-Clause | Ollama HTTP client |
| asyncpg | 0.32.0 | Apache-2.0 | PostgreSQL (instead of psycopg, which is LGPL-3.0) |
| boto3 | 1.43.126 | Apache-2.0 | S3 (SeaweedFS) |
| trafilatura | 2.3.1 | Apache-2.0 | text extraction (used by ai-data) |
| rapidfuzz | 3.14.6 | MIT | fuzzy quote matching |
| numpy | 2.5.4 | BSD-3-Clause (+ permissive) | vectors |
| pyyaml | 6.0.3 | MIT | config.yaml |
| ruff (dev) | 0.17.4 | MIT | lint/format |
| pytest (dev) | 9.2.0 | MIT | tests |
| pytest-asyncio (dev) | 1.4.1.post1 | Apache-2.0 | async tests (ai-data conftest); 1.5.0 skipped by exclude-newer, OSV: 0 CVE |

Transitive notes: certifi is MPL-2.0 (allowed).

| Image | Tag | License |
|---|---|---|
| python | 3.12.12-slim-bookworm | PSF |
| ghcr.io/astral-sh/uv | 0.9.15 | MIT/Apache-2.0 |

## Models (Ollama; names only in .env: OLLAMA_LLM_MODEL, OLLAMA_EMBED_MODEL)
| Model | Tag | License | Purpose |
|---|---|---|---|
| Bielik 11B v2.3 Instruct | `hf.co/speakleash/Bielik-11B-v2.3-Instruct-GGUF:Q4_K_M` | Apache-2.0 | M1/M2/M3 classification |
| bge-m3 | `bge-m3` | MIT | embeddings (1024 dims) |
