# ai/ — dependencies

Versions resolved with `exclude-newer = 2026-11-07` (releases older than ~2 weeks). Final audit 2026-11-21: `pip-audit` 2.10.1 on the full `uv.lock` (47 runtime packages, 50 with dev) → 0 known vulnerabilities (report: `ai/SECURITY.md`). Licenses read from installed package metadata.

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

Transitive notes: certifi is MPL-2.0 (allowed, file-level copyleft, unmodified). `tld` (via courlan/trafilatura) is offered as MPL-1.1 OR GPL-2.0-only OR LGPL-2.1-or-later; we use it under MPL-1.1, unmodified. `regex` is Apache-2.0 AND CNRI-Python (permissive). `numpy` bundles BSD/0BSD/MIT/Zlib/CC0 parts. No GPL/AGPL/SSPL package is used under its copyleft terms.

### Main transitive packages (license)
| Package | Version | License |
|---|---|---|
| starlette | 1.10.0 | BSD-3-Clause |
| pydantic-core | 2.50.4 | MIT |
| anyio | 4.16.0 | MIT |
| h11 / httpcore | 0.16.0 / 1.0.9 | MIT / BSD-3-Clause |
| uvloop / httptools / watchfiles / websockets | 0.23.0 / 0.9.0 / 1.3.0 / 17.4 | Apache-2.0+MIT / MIT / MIT / BSD-3-Clause |
| click | 8.5.1 | BSD-3-Clause |
| botocore / s3transfer / jmespath | 1.43.126 / 0.19.3 / 1.1.0 | Apache-2.0 / Apache-2.0 / MIT |
| urllib3 / certifi / idna / charset-normalizer | 2.8.0 / 2026.10.23 / 3.20 / 3.5.2 | MIT / MPL-2.0 / BSD-3-Clause / MIT |
| lxml / lxml-html-clean | 6.1.3 / 0.4.6 | BSD-3-Clause |
| courlan / htmldate / justext | 1.4.0 / 1.11.0 / 3.0.2 | Apache-2.0 / Apache-2.0 / BSD |
| dateparser / python-dateutil / pytz / tzlocal / regex | 1.5.0 / 2.9.0.post0 / 2026.6 / 5.4.5 / 2026.11.7 | BSD-3-Clause / BSD+Apache-2.0 / MIT / MIT / Apache-2.0 |
| tld | 0.13.2 | MPL-1.1 (chosen from tri-license) |
| python-dotenv / six / babel / packaging / typing-extensions | 1.2.4 / 1.17.0 / 2.18.0 / 26.3 / 4.16.0 | BSD-3-Clause / MIT / BSD / Apache-2.0 OR BSD-2-Clause / PSF-2.0 |
| opentelemetry-api / annotated-types / typing-inspection / annotated-doc | 1.45.2 / 0.8.0 / 0.4.5 / 0.0.5 | Apache-2.0 / MIT / MIT / MIT |
| pygments / iniconfig / pluggy (dev) | 2.21.0 / 2.3.1 / 1.7.0 | BSD-2-Clause / MIT / MIT |


| Image | Tag | License |
|---|---|---|
| python | 3.12.12-slim-bookworm | PSF |
| ghcr.io/astral-sh/uv | 0.9.15 | MIT/Apache-2.0 |

## Models (Ollama; names only in .env: OLLAMA_LLM_MODEL, OLLAMA_EMBED_MODEL)
Tags verified with `ollama list` / `ollama show` on 2026-11-21. Licenses from `ollama show --license` or the upstream Hugging Face model card (`license:` field).

| Model | Exact Ollama tag | Params / quant | Context | License | Role |
|---|---|---|---|---|---|
| Bielik 11B v2.3 Instruct (**default**, in `.env.example` and `infra/ollama/pull-models.sh`) | `SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M` (id `b0dc93a20fdb`, 6.7 GB; used by the running compose stack) | 11.2B, Q4_K_M | 32768 | Apache-2.0 (HF `speakleash/Bielik-11B-v2.3-Instruct`) | M1/M2/M3 classification |
| Bielik 11B v2.3 Instruct (GGUF from HF, local dev alias) | `hf.co/SpeakLeash/Bielik-11B-v2.3-Instruct-GGUF:Q4_K_M` (also tagged `bielik:latest`, id `de12f4d9d950`) | 11.2B, Q4_K_M | 32768 | Apache-2.0 | same weights as above, alternative source |
| Bielik 11B v3.0 Instruct (optional upgrade) | `SpeakLeash/bielik-11b-v3.0-instruct:Q4_K_M` (id `3b52b68a462e`, 6.7 GB) | 11.2B, Q4_K_M | 32768 | Apache-2.0 (HF `speakleash/Bielik-11B-v3.0-Instruct`) | drop-in via `OLLAMA_LLM_MODEL`; not yet re-measured on the gold set |
| gemma4 (fallback / comparison) | `gemma4:latest` (id `c6eb396dbd59`, 9.6 GB) | 8.0B, Q4_K_M | 131072 | Apache-2.0 (`ollama show --license`) | general model; a "thinking" model, so check `format` + latency before using |
| bge-m3 | `bge-m3:latest` (id `790764642607`, 1.2 GB) | 566.7M, F16 | 8192 | MIT (`ollama show --license`; HF `BAAI/bge-m3`) | embeddings, 1024 dims |

Notes: the Ollama manifest for the Bielik tags carries no license layer, so their license comes from the Hugging Face model cards. Switching the LLM needs only `OLLAMA_LLM_MODEL` in `.env` plus a pull; prompts and scoring are model-agnostic, but weights/thresholds were tuned on v2.3. Docker compose pulls only the two models named in `.env` (`ollama-init`).
