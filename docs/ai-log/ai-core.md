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

- **Task:** wiring after PR #10 (ai-data): `asyncio_mode = "auto"` in pyproject, Dockerfile copies `seed/` and `eval/`, `seed_entities` runs in lifespan after the pool (failure logged, no crash), `GET /eval` calls `evaluate()` (503 without DB; `EvalResult` got `total`, `missing_findings`). `/analyze` was already wired in `pipeline.py`. **Open:** `embed()` still reads `OLLAMA_BASE_URL` (ai-data to switch to `OLLAMA_URL`, the name used everywhere else); `EvalResult` shape not in `contracts.md` (team/api); 12 ruff E501 errors remain in ai-data files. Not run: `/eval` against a live DB.

## 2026-11-21 — issue #18: LOG_LEVEL from .env
- **Task:** `LOG_LEVEL=info` (shared with pino, lowercase) crashed `ai` at startup (`ValueError: Unknown level`). Added `_resolve_log_level()` in `main.py`: upper-cases, maps pino-only `trace` to DEBUG, unknown value falls back to INFO with a warning instead of crashing. Test: `tests/test_app.py::test_resolve_log_level`.
- **Verified:** `LOG_LEVEL=info` and `LOG_LEVEL=verbose` import cleanly, ruff clean, 49 passed / 5 skipped. **Not verified:** container start in compose.
- **Not ours (reported to owners):** #19 (infra) — `bielik-11b-v2.3-instruct:Q4_K_M` is absent in the registry; `SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M` exists (manifest 200, ~6.7 GB). #16 (infra) — compose volume `./infra/seed:/app/seed` shadows `ai/seed`.

## 2026-11-21 — live test, M1/M3, alerts, demo set
- **Task:** live check on Ollama (Bielik 11B Q4 + bge-m3), then M1 (`modules/m1.py`, prompt `m1-v1`), M3 (`modules/m3.py`, `rules/m3.yaml`, prompt `m3-v1`, hybrid rules + anchor similarity + LLM), `alerts.py` (`POST /internal/alerts`, `X-Internal-Token`, 1 retry, never fails the analysis), embedding anchors in the score, `analysis.py` shared by the pipeline and the new demo endpoint `POST /analyze-text` (saves nothing). Demo: `ai/demo/scenarios.{json,md}`, `ai/scripts/{live_check,demo_check}.py`. Skill: `risk-classifier`.
- **Measured:** M2 call 30–55 s warm, cold start > 60 s (first call timed out) → `llm.timeout_s` 60→120 (it was a constant, config value was ignored), `keep_alive` 30m, background warm-up at startup. Embedding 0.1–0.3 s warm. Bielik returned schema-valid JSON in every run; all non-empty quotes passed rapidfuzz (≥ 90). Empty quote + `fail` is dropped (no quote, no flag).
- **Verified in Docker (own pgvector Postgres + SeaweedFS, host Ollama):** image builds (529 MB), `/health` ok, `seed_entities` 86 inserted then 86 updated on restart, alerts only for `high` (3 received by a mock api with the right token and contract payload), `module_settings` weights override config (doc c: 0.766 → 0.824 → alert), `/eval` returns metrics.
- **Bug found by tests:** M3 rule `Twoim portfelem` did not match (`twoj\w+`); fixed to `tw\w+`.
- **Human to verify:** M1/M3 prompts and criteria, M3 phrase list, anchor phrases, `embedding.floor/ceil` (0.45/0.75, set from 3 samples), M1 keeps one finding per document (strongest candidate).
- **Not verified / open:** real precision/recall (`ai/eval/gold.csv` is header only, ai-data); `docker compose up` of the whole stack (compose `.env` has empty `POSTGRES_PASSWORD`, `./infra/seed:/app/seed` mount still crashes `ai` with `ModuleNotFoundError: seed.seed_entities`, #16); default `OLLAMA_LLM_MODEL` tag (#19); `OLLAMA_BASE_URL` aliased in `app/__init__.py` as a workaround until ai-data switches `embeddings.py` to `OLLAMA_URL`; M2 has no embedding anchors, so `w_emb` is dropped for M2; `/analyze-text` is not in `contracts.md`.

## 2026-11-21 — review of AI issues (#36, #19, #16)
- **Task:** go through open issues touching `ai`, fix what is in ai-core scope, close only what is fixed on `main`.
- **Result:** merged `origin/main` into `team/ai-core` (clean; ruff clean, 68 passed / 5 skipped), pushed. PR #38 is mergeable. #36: workaround (`OLLAMA_URL` → `OLLAMA_BASE_URL` alias in `ai/app/__init__.py`) is in PR #38, proper fix is in ai-data PR #34. #19 and #16 are infra files (`.env.example`, `pull-models.sh`, `docker-compose.yml`), patch from the lead is not in any PR yet. Not closed: nothing of this is on `main` yet.
- **Human to verify:** after merging #34/#38 and the infra PR, `docker compose up --build` then `POST /analyze/1` → 200.
