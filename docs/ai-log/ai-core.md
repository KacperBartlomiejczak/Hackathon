# AI log — ai-core

## 2026-11-21 — szkielet ai/
- Zlecono: init `ai/` (uv, Python 3.12, FastAPI, Pydantic v2 wg `docs/contracts.md`, logging, ruff z zakazem `print`, Dockerfile), `GET /health` sprawdzający Ollamę.
- Skille: `dependency-guard` (licencje z PyPI, OSV = 0 CVE, wersje `==` i `exclude-newer` −2 tyg., `pip-audit` czysty), `risk-classifier` (układ `prompts/`, `rules/`).
- Zweryfikowano: `uv run pytest` (2 testy z mockiem Ollamy), `/health` na żywo → `ollama: ok`, 3 modele.
- Do weryfikacji przez człowieka: `docker build ai/` (lokalnie brak Dockera), licencja Bielika w `ai/DEPENDENCIES.md`.

## 2026-11-21 — merge of two parallel skeletons (this machine + other machine)
## 2026-11-21 — ai/ skeleton
- **Task:** scaffold `ai/` (uv, deps, `models.py`, `main.py` with `/health` + stubs, `config.yaml`, Dockerfile).
- **Skills:** `dependency-guard` (license/CVE check of every package and transitive deps), `risk-classifier` (risk levels, no invented scores on stubs). No `fastapi` skill exists in the repo.
- **Human decisions/corrections:**
  - `psycopg` is LGPL-3.0 → replaced by `asyncpg` (Apache-2.0) after approval.
  - `/eval` kept as GET per `docs/contracts.md` (request said POST).
  - `M1Candidate` and `EvalResult` are not in contracts yet → marked TODO for team/api (`data-contract`).
- **Bug caught by test:** `Literal[1,2,3]` as a query param did not coerce `"2"` → 422; switched to `int` with `ge=1, le=3`.
- **Not verified:** Docker build (daemon not running), live Ollama (remote), live Postgres (schema from #4 pending).
- **Merge:** both machines built the same skeleton. Kept this version (models, stubs, Postgres check) and took from the other: `exclude-newer` guard (pins lowered to match: fastapi 0.162.0, pydantic 2.14.3, boto3 1.43.126, numpy 2.5.4, ruff 0.17.4), `modules/ prompts/ rules/ SECURITY.md`, model licence table.
- **Env names aligned with compose/.env.example:** `OLLAMA_URL` (no localhost default), `OLLAMA_LLM_MODEL`, `OLLAMA_EMBED_MODEL`. `ai/app/embeddings.py` (ai-data) still reads `OLLAMA_BASE_URL` with localhost default → ask team/ai-data to switch.
- Dropped as superseded: `app/config.py`, `app/logging_setup.py`, `tests/test_health.py`; `pytest-asyncio` removed (unused).

## 2026-11-21 — db / storage / llm clients
- **Task:** `ai/app/db.py` (asyncpg pool from `DATABASE_URL`), `storage.py` (boto3 `get_html`, S3_* env), `llm.py` (Ollama chat, `format` = Pydantic JSON Schema, temperature 0, 60 s timeout + 1 retry, errors raise `LLMError`, never a default result). Tests with mocks (15 pass, ruff clean).
- **Human decision:** `psycopg_pool` requested, but psycopg is LGPL (already rejected earlier) → kept `asyncpg`; no new dependencies.
- **Not verified:** live Postgres, live S3/SeaweedFS, live Ollama; S3 env names (`S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, optional `S3_REGION`) are assumed.
