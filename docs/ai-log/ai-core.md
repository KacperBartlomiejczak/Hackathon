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

## 2026-11-21 — pytest-asyncio
- ai-data `tests/conftest.py` needs `pytest_asyncio`. `dependency-guard`: Apache-2.0, OSV 0 CVE, pinned 1.4.1.post1 (1.5.0 is newer than `exclude-newer`). Suite: 35 passed, 5 skipped (no test Postgres). `pip-audit` not run (not installed in venv).

## 2026-11-21 — /analyze/{id} + M2 v1 (checkpoint 19:00)
- **Task:** full pipeline in `app/pipeline.py` (fetch → clean → dedup → embed → route → module → quote validation → upsert findings → `processed`; failures → `failed`, HTTP 502, no invented score). M2 v1 (`modules/m2.py`, `prompts/m2-risk-info/system.md`, `m2-v1`) with 4 criteria; `routing.py`, `scoring.py` (missing `emb` is dropped and weights renormalised), `modules/quotes.py` (`rapidfuzz.partial_ratio >= 90`), DB helpers in `db.py`. M1/M3 are routed but skipped with a log line. Skill: `risk-classifier`.
- **Human decisions:** keep `asyncpg`; 4-criterion checklist for v1 (full UKNF annex in v2); prompt path per CLAUDE.md; alert to `/internal/alerts` postponed until after 19:00.
- **Tests:** 42 pass, 5 skipped (mocked LLM/DB), new files lint clean. Pre-existing E501 in ai-data files and conftest/test_eval untouched.
- **Not verified:** live Postgres/S3/Ollama; `embeddings.py` still reads `OLLAMA_BASE_URL` (ai-data must switch to `OLLAMA_URL` or `/analyze` embeds against localhost).

- **Task:** live test of M2 against remote Bielik-11B showed one copied quote for all 4 criteria and constant confidence 0.5. Prompt bumped to `m2-v2` (per-criterion quotes, confidence calibration, one format-only example); `CriterionResult.quote` is now required in the schema (the model omitted it otherwise). **Verified:** re-run on a "15% guaranteed" ad gives differentiated confidence and 2/2 quotes kept. **Open:** for `risk_warning_present`/`risk_prominence` the model still returns an empty quote when the warning is absent, so that reason is dropped. Skill: `risk-classifier`.
