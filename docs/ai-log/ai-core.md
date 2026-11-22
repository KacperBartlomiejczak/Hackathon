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

## 2026-11-21 — local live test of /analyze (no Docker for ai, infra/ untouched)
- **Task:** run `ai` with uvicorn against a throwaway pgvector Postgres + SeaweedFS (docker run, ports 5432/8333), host Ollama, mock api on :3000; seed the 4 `ai/demo/scenarios.json` texts as documents 1–4; `POST /analyze/{1..4}`.
- **Result:** all 200 in 40–63 s each (Bielik 11B Q4 warm). Doc 1 legit XTB → M2 low 0.00; doc 2 scam → M1 high 0.848 (alert sent); doc 3 borderline → M1 medium 0.766 (no alert; calibrated weights push it to high); doc 4 shadow advisory → M3 high 0.914 (alert sent). Alerts reached the mock api with the right token. Env had only `OLLAMA_URL` (alias worked, no localhost fallback).
- **Found:** each document gets one finding (router picks one module), not M1+M2+M3 at once. After ai-data PR #34 the test `test_ollama_base_url_alias` failed (it asserted `emb.OLLAMA_BASE_URL`); made it accept both names, so #38 needs no rebase. Merge #38 + #34 is textually clean, 69 passed on the merged tree.
- **Not verified:** local `.env` (read was denied by permissions, values passed explicitly); the model name `SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M` is not pulled on this machine, used `hf.co/SpeakLeash/Bielik-11B-v2.3-Instruct-GGUF:Q4_K_M` (same size as `bielik:latest`).

## 2026-11-21 — PR #38 review fixes (lead's comments)
- **Task:** apply the lead's review of PR #38 after ai-data PR #34 landed on `main`.
- **Result:** removed the `OLLAMA_BASE_URL` alias in `ai/app/__init__.py` and its test (`embeddings.py` reads `OLLAMA_URL` now); dropped `_VERDICT_MAP` in `ai/app/modules/m1.py`, matcher verdicts `fail`/`unclear` pass through unchanged. Merged `origin/main` first; ruff clean, 68 passed / 5 skipped.
- **Not done (out of scope):** `/analyze-text` has no auth and `docker-compose.yml` publishes `8000:8000` (infra file) — left for the lead/infra owner.
- **Human to verify:** a M1 finding shows `fail` (not `unclear`) in the UI/export.

## 2026-11-21 — issue #41: modules run concurrently, per-document time budget
- **Task:** `run_modules` (`ai/app/analysis.py`) starts the routed modules as concurrent tasks instead of a sequential loop, with `analysis.budget_s` (`config.yaml`, 240 s, below the collector's 300 s) as wall-clock budget. A module that fails (`LLMError`) or misses the budget is logged (`partial=true`) and left out — no invented score; the finished modules still produce findings. All modules failed / over budget → the first error is raised, the document ends `failed`. Signature unchanged, so `pipeline.py` and `/analyze-text` needed no edits. 5 new tests in `tests/test_modules.py` (concurrency, one failed, all failed, partial budget, empty budget). Skill: `risk-classifier`.
- **Measured (Bielik 11B Q4 + bge-m3, local Ollama, doc routed to M1+M3, warm):** total 82 s; M3 alone ~40 s, M1 82 s (queued behind M3). That is the same as sequential: Ollama runs one request at a time with the default `OLLAMA_NUM_PARALLEL=1`, so concurrency alone gives no speed-up. **Needs infra:** `OLLAMA_NUM_PARALLEL=2` on the `ollama` service in `docker-compose.yml` (costs extra RAM/VRAM for the second KV cache) — not tested here.
- **What this does fix:** worst case is now bounded (240 s + retries cannot push `/analyze` past the collector timeout), and one failing module no longer discards the other modules' findings. Router sends most documents to a single module, so the typical document was never affected.
- **Not done:** plan B (LLM only for candidates with a high rules/embedding score) — changes scoring and the gold-set results, left for a separate step; async 202 variant of `/analyze` (needs api/collector/contract changes).
- **Human to verify:** that a document with one module missing (`partial=true` in logs) is acceptable as `processed` — there is no per-document marker in the DB for it.

## 2026-11-21 — X-Internal-Token guard for ai endpoints (opt-in)
- **Task:** `ai` had no auth on any endpoint (`/analyze-text` included; the contract says "no token"). Added `ai/app/auth.py` (`require_internal_token`, `hmac.compare_digest`) on `/analyze/{id}`, `/analyze-text`, `/reanalyze`, `/eval`; `/health` stays open for the compose healthcheck. 8 new tests in `tests/test_app.py` (401 missing/wrong token, pass with valid token, fail-closed 503 when `INTERNAL_TOKEN` is empty, `/health` open, off by default). `scripts/demo_check.py` sends the header when `INTERNAL_TOKEN` is set.
- **Why opt-in (`AI_REQUIRE_TOKEN=true`, default off):** the collector (`collector/src/ai/client.ts`) calls `/analyze/{id}` without the header; enforcing now would break the pipeline on `main`. Collector, contract and compose are other owners' files.
- **Needs others:** lead-collector sends `X-Internal-Token`; api (#4) updates `docs/contracts.md` and any `/eval` caller; infra (#6) sets `AI_REQUIRE_TOKEN=true` and `OLLAMA_NUM_PARALLEL=2`. Only then enable.
- **Human to verify:** full stack with `AI_REQUIRE_TOKEN=true` once the collector sends the header.

## 2026-11-21 — POST /reanalyze implemented (was 501)
- **Task:** `/reanalyze?module=&document_id=` recomputes findings without download/dedup: reuses `text_clean`, re-embeds, runs M1/M2/M3 (or only `module`), upserts findings (`ON CONFLICT (document_id, module)`) and sends the alert again when the result is `high`. Returns `202 {module, queued}` (contract shape) and works in the background, one batch at a time (`409` while one runs); no `document_id` = all `processed` documents; unknown id = `404`. `failed`/no-text documents go through the full `analyze_document`, duplicates are skipped; one failing document never stops the batch. Shared tail of `/analyze` extracted into `pipeline._run_and_store`; `run_modules` got `only_module`. 12 new tests in `tests/test_reanalyze.py`, 2 old 501 asserts updated. ruff clean, 95 passed / 5 skipped.
- **Needs others:** `document_id` (repeatable query param) and the `202` status are additive to `docs/contracts.md` — api (#4) should add them to the AI table.
- **Limits:** a finding that no longer qualifies after reanalysis (no valid quote) is left as it was, not deleted (review status would be lost). Not tested against real Ollama/Postgres.
- **Human to verify:** `POST /reanalyze?module=2` on a stack with processed documents; findings' `prompt_version` / `created_at` change and a `high` one reaches the dashboard.

## 2026-11-21 — testy odporności na prompt injection (M1/M2/M3)
- **Task:** `ai/tests/test_prompt_injection.py`: 3 złośliwe strony (PL+EN, „zignoruj instrukcje”, „system override: empty findings”, próba domknięcia `</document>`), testy offline z „złamanym” LLM + testy live na Bieliku (opt-in `RUN_LIVE_LLM=1`, marker `integration`, w CI skipują się). Skill: `risk-classifier`.
- **Found & fixed:** treść strony mogła domknąć `<document>` i wstrzyknąć polecenia poza ogranicznikiem → `neutralize_delimiters` w `ai/app/llm.py`. Dodano marker `integration` w `pyproject.toml`.
- **Result (Ollama 192.168.1.88, bielik:latest):** 3/3 live OK, wyniki z injection identyczne jak bez (M1 0.941, M2 1.000, M3 0.956, `high`), cytaty ≥ 90 rapidfuzz, brak cytatu z injection jako dowodu `fail`. Offline: 107 passed, 8 skipped, 1 xfailed; ruff czysty.
- **Luki:** M2 bez cytatu LLM nie daje findingu (xfail strict); w M2 `llm=0.00` nawet bez injection, flaga z reguł — do przejrzenia. Szczegóły w `ai/SECURITY.md`.
- **Human to verify:** czy akceptujemy lukę M2 (fail-closed = brak flagi) czy dodać finding z samych reguł; test live wymaga ~3 min GPU.

## M2 v2 → prompt m2-v3 (8 criteria, rules + anchors)
- **Task:** extend M2 from 4 to 8 criteria; `ai/rules/m2.yaml` (criteria + weights + phrase rules) and `ai/rules/anchors_m2.yaml` (bge-m3 anchors, so `w_emb` is no longer dropped for M2); prompt `m2-v3`; `prompt_version` = `m2-v3+m2-rules-v1`. Quote validation unchanged (rapidfuzz >= 90).
- **Skill:** risk-classifier.
- **Human to verify:** the UKNF annex was not available (placeholder in the brief), so the criteria follow MiFID II art. 44 / Reg. 2017/565 (past performance, leverage/CFD, fair & clear, trivialization). Reconcile ids/wording in `rules/m2.yaml` + the prompt once the annex arrives; then re-tune weights on the gold set.

## 2026-11-21 — kalibracja wag i progów (BLOKADA: brak gold setu)
- **Task:** baseline → analiza FP/FN → strojenie wag/progów (`ai/config.yaml`, `module_settings`) → ewaluacja po zmianach → zestawienie przed/po.
- **Stan zastany:** `ai/eval/gold.csv` ma tylko nagłówek (`document_id,module,label`) na `main`, `team/ai-data` i `team/ai-core`. `GET /eval?module=1..3&threshold=0.6` działa, ale zwraca `total=0` (tp/fp/fn/tn = 0). W bazie: 16 `documents`, 0 `findings`; `module_settings` = domyślne (próg 0.6, wagi llm 0.6 / rules 0.25 / emb 0.15).
- **Decyzja:** nie wymyślamy etykiet ani metryk — wagi i progi bez gold setu byłyby zgadywaniem, a liczby na slajdzie nie do obrony. `config.yaml` i `module_settings` bez zmian.
- **Baseline (obecne ustawienia):** M1/M2/M3 — brak danych (gold set pusty).
- **Do zrobienia po dostarczeniu gold setu (ai-data):** (1) wypełnić `ai/eval/gold.csv` dla dokumentów istniejących w bazie; (2) `POST /reanalyze` dla M1–M3, żeby powstały `findings`; (3) `GET /eval` na progach 0.3–0.9 (krok 0.05) → baseline; (4) FP/FN → wagi w `config.yaml` + `UPDATE module_settings`; (5) ponowny `/eval` i tabela „przed vs po” tutaj. Cel: recall ≥ 0.9 dla `risk=high`, precision ≥ 0.8.
- **Human to verify:** czy ai-data faktycznie wypchnął `gold.csv` (może leży lokalnie, niezcommitowany); gold set musi odnosić się do `document_id` z bazy.

## 2026-11-21 — dokumentacja końcowa i smoke test (ai-core)
- **Zlecono:** pełny `pip-audit` → `ai/SECURITY.md`; dokładne tagi i licencje modeli oraz bibliotek → `ai/DEPENDENCIES.md`; treść slajdu „Jak działa AI”; smoke test stosu compose.
- **Skille:** `dependency-guard` (audyt, licencje), `sca-audit` (pip-audit). Licencje modeli sprawdzone `ollama show --license` + karty HF (Bielik v2.3/v3.0 = Apache-2.0, gemma4 = Apache-2.0, bge-m3 = MIT); manifest Ollamy dla Bielika nie ma warstwy licencji, więc źródłem są karty HF.
- **Wynik audytu:** 47 pakietów runtime (50 z dev), 0 znanych podatności. `tld` (tranzytywny) ma trójlicencję MPL/GPL/LGPL — używamy jako MPL-1.1.
- **Smoke test (lokalny compose, działał od ~40 min):** wszystkie serwisy `healthy` poza `web` (nie nasz zakres); `ai:/health` → `ollama ok, postgres ok`; `/eval` odpowiada (puste, bo gold set pusty); `uv run pytest` 111 passed / 8 skipped / 1 xfailed; `ruff` czysty. W bazie 6 dokumentów `processed`, 9 `failed`: Ollama w Dockerze na Macu działa na CPU, Bielik 11B przekracza budżet 240 s / timeouty (`ai.analysis ... over budget`). To ograniczenie sprzętu, nie kodu — na demo Ollama z GPU (lub natywna Ollama na hoście, `OLLAMA_URL=http://host.docker.internal:11434`). **0 findings w bazie** — przed demo trzeba puścić `POST /reanalyze` na maszynie z GPU.
- **`.env.example`:** brakuje tylko opcjonalnych `AI_REQUIRE_TOKEN` (domyślnie wyłączone) i `AI_CONFIG` (domyślna ścieżka `config.yaml`) — plik należy do `team/infra`, nie zmieniam. Reszta zmiennych używanych przez `ai/` (`DATABASE_URL`, `OLLAMA_*`, `S3_*`, `API_URL`, `INTERNAL_TOKEN`, `LOG_LEVEL`) jest.
- **Do weryfikacji przez człowieka:** czy włączamy `AI_REQUIRE_TOKEN=1` na demo (collector musi wtedy wysyłać `X-Internal-Token`); czy przełączamy domyślny model na Bielik v3.0 (nieprzetestowany na gold secie).

### Slajd: „Jak działa AI”
**Trzy moduły, jeden pipeline** — dokument z collectora → czyszczenie (trafilatura) → deduplikacja (hash + simhash) → embedding **bge-m3** → routing → moduły → zapis `findings` → alert Socket.io dla wysokiego ryzyka.

| Moduł | Pytanie | Sygnał |
|---|---|---|
| **M1 Finfluencerzy** | Czy ktoś spoza firmy reklamuje jej produkt? | wzmianka o podmiocie z rejestru + domena/handle ≠ `official_domains` |
| **M2 Informacja o ryzyku** | Czy materiał firmy spełnia 8 wymogów informacji o ryzyku? | checklista spełniony/niespełniony + cytat, proporcja „zysk vs ryzyko” |
| **M3 Shadow advisory** | Czy podmiot spoza rejestru KNF doradza lub zarządza portfelem? | słownik fraz + podobieństwo do fraz wzorcowych + ocena LLM |

**Hybrydowy scoring:** `score = 0,6·LLM + 0,25·reguły + 0,15·embeddingi`
- **LLM:** Bielik 11B (Ollama, on-premise, `temperature 0`, odpowiedź wymuszona schematem JSON).
- **Reguły:** słowniki i wzorce w YAML, zawsze z cytatem.
- **Embeddingi bge-m3:** cosine do fraz wzorcowych (anchors), skala 0,45 → 0 … 0,75 → 1.
- **Walidacja cytatów (rapidfuzz):** cytat musi występować w tekście (`partial_ratio ≥ 90`), inaczej odpada. Bez cytatu nie ma flagi — zero halucynowanych dowodów.
- **Progi i wagi** zmieniane na żywo w panelu kalibracji; `/eval` zwraca precision/recall/FP/FN.

**Współbieżność:** moduły dla dokumentu działają równolegle (`asyncio`), wspólny budżet 240 s; moduł, który zawiedzie lub przekroczy budżet, jest pomijany i logowany — nigdy nie wstawiamy zmyślonego wyniku. `/reanalyze` przelicza partię w tle po zmianie progów.

**Zabezpieczenia:** treść strony to dane, nie instrukcje (`<document>` + neutralizacja domknięcia znacznika, testy prompt injection PL/EN); token `X-Internal-Token` na endpointach wewnętrznych; `asyncpg` zamiast LGPL `psycopg`; wersje przypięte, `pip-audit`: 0 podatności; tylko modele open source (Apache-2.0 / MIT), nic nie wychodzi poza infrastrukturę.

## 2026-11-21 ~20:30 — przegląd PR-ów i issues powiązanych z AI
- **Zlecono:** przeanalizować wszystkie PR-y i issues, wskazać te z AI, naprawić i zamknąć, co się da.
- **Wynik:** jedyny otwarty PR to #59 (docs, czysty, czeka na merge leada). Issues #42 (pusty gold set), #53 (brak załącznika UKNF) i #56 mają komentarze ze stanem. Nie da się ich zamknąć bez człowieka: etykiety i załącznik trzeba dostarczyć ręcznie.
- **Dodano:** `ai/scripts/score_fixtures.py`, pomoc przy etykietowaniu gold setu. Wysyła fixtures do `/analyze-text` i zapisuje CSV ze score M1/M2/M3 oraz pustą kolumną `label`. Etykiet nie zgaduje.
- **Do weryfikacji przez człowieka:** skrypt sprawdzony tylko na atrapie serwera, bo Ollamy nie ma na tym komputerze. Trzeba uruchomić go na maszynie z Ollamą: `python ai/scripts/score_fixtures.py --out scores.csv`.

## 2026-11-21 ~21:30 — #62: pierwszy test na żywym Bieliku + poprawka reguł M3
- **Zlecono:** uruchomić `score_fixtures`, `demo_check` i `live_check` na maszynie z Ollamą (#62), potem poprawić reguły M3.
- **Wynik:** serwis lokalnie przez `uv`, bez Postgresa. 14/14 fixtures OK, demo 5/5 OK, JSON z M2 poprawny. RTX 3060 12 GB: ~5 s na dokument dla M1/M3, ~10 s dla M2. Wyniki są w komentarzu do #62.
- **Poprawka:** `ai/rules/m3.yaml` → `m3-rules-v2`: rzeczownik „zarządzanie portfelem”, „rekomendacje inwestycyjne”, „napisz do nas na priv”. Dodano test regresji. `@family_office_alfa`: rules 0.00 → 0.85, score 0.284 → 0.496. Dalej poniżej progu 0.6 przez LLM 0.33. Pozostałe score bez zmian.
- **Do weryfikacji przez człowieka:** czy niski llm M3 dla tego tekstu poprawić promptem, czy zostawić jako przypadek graniczny do gold setu.

## 2026-11-21 ~22:00 — #62 cd.: prompt M3 v2, reguły M2 v2, cytaty sklejone przez LLM
- **Zlecono:** naprawić anomalie z #62 według uznania ai-core.
- **Diagnoza (surowe odpowiedzi Bielika):**
  - family_office: kryterium 1 w prompcie M3 wymagało konkretnego instrumentu, więc oferta „dobierzemy akcje do profilu” dostawała `pass`;
  - sygnaly-vip: Bielik skleja dwa niesąsiadujące zdania w jeden cytat i walidacja go odrzucała. Instrukcja w prompcie tego nie zmieniła, więc ją cofnięto;
  - Noble: reguły M2 nie łapały „35% w ostatnim roku” i „bez wysiłku”.
- **Zmiany:**
  - `m3-v2`: kryterium 1 obejmuje ofertę spersonalizowanych rekomendacji;
  - `m2-rules-v2`;
  - `quotes.py`: cytat z kilku zdań jest przyjmowany tylko wtedy, gdy każde zdanie występuje dosłownie (rapidfuzz ≥ 90);
  - testy regresji dla wszystkich trzech zmian.
- **Wynik:** family_office 0.496 → 0.724, Noble 0.498 → 0.635, zloty-portfel 0.619 → 0.862 (high), sygnaly-vip 0.617 bez zmian, XTB-ok 0.052, demo 5/5, pytest 114 passed.
- **Świadomie bez zmian:** M1 0.55–0.59 tuż pod progiem (przypadki graniczne do suwaka); `kasa_z_marta` (fikcyjny broker, brak w `entities.csv`; zakres ai-data/lead).

## 2026-11-21 — M2 v4 i M3 v3 według załącznika UKNF (#53)
- **Zlecono:** zmapować 18 reguł z załącznika UKNF (znalezionych przez ai-data, `ai/eval/rubric.md` na `team/ai-data`) na kryteria M2 i dodać definicję art. 76 do M3.
- **Zmiany:** `m2-v4` + `m2-rules-v3`: 16 kryteriów zamiast 8. Dotychczasowe 8 zachowało id i wagi (nie ruszamy strojenia z #62). Nowe: `firm_identification` (reguła 1), `advertising_label` (2), `historical_results_conditions` (12a/b), `comparison_basis` (11), `forecast_warning` (15), `tax_disclosure` (16), `supervisor_approval` (17/18), `risk_warning_language` (9/10). Reguły 3, 6/7, 14 mapują się na istniejące kryteria. Wagi llm: `min(1, Σ w·conf)`, suma wag ≥ 1 (nie dokładnie 1). Reguły układu (4, 5, 7 w części graficznej, 8, 13) wymagają HTML/screenshotu i są poza zakresem. Do `m2.yaml` dodane frazy `supervisor_claim`, `forecast`, do anchorów M2 dwie frazy. `m3-v3`: definicja art. 76 i lista instrumentów w prompcie, fraza „trzymaj akcje” w `m3.yaml`.
- **Do sprawdzenia przez człowieka:** wynik na żywym Bieliku (nie uruchamiano — brak Ollamy na tej maszynie): czas M2 (więcej pól w JSON) oraz czy `firm_identification` / `advertising_label` nie dają fałszywych `fail` na fixtures.
- **Poza naszym zakresem:** `web/src/lib/utils.ts` nie ma etykiet dla 8 nowych id (UI pokaże surowy kod); `presentation/*` i `docs/contracts.md` wspominają 4 kryteria M2.

## 2026-11-21 — issues #70 (część ai) i #73 (część ai)
- **Zlecono:** przejrzeć otwarte issues dla ai-core i domknąć to, co leży w `ai/`.
- **#70:** `/eval` nie zwraca już tekstu wyjątku w `detail` (`eval failed`, szczegóły tylko w logu), test regresji z fałszywym wyjątkiem zawierającym DSN. Testy 401/503 dla tokenu już istniały (`test_app.py`). Zostaje po stronie innych: `X-Internal-Token` w collectorze i w proxy `/eval` w api, `AI_REQUIRE_TOKEN` i `AI_CONFIG` w `.env.example` (infra).
- **#73:** skan Trivy: `python:3.12.12-slim-bookworm` 9C/133H → `3.12.16-slim-bookworm` 2C/99H (bez poprawek upstream) → `3.12.16-slim-trixie` **0C/51H**. Dockerfile przełączony na trixie, obraz zbudowany, import zależności i `uid=10001` sprawdzone, pytest 117 passed. Wynik w `ai/SECURITY.md`.
- **Do sprawdzenia przez człowieka:** `docker compose up --build` z nowym obrazem `ai` (nie uruchamiano pełnego stosu z Ollamą na tej maszynie).

## 2026-11-22 — #95 M3: zastrzeżenie „nie jest rekomendacją” jako dowód
- **Zlecono:** finding 65 (XTB) cytował disclaimer jako dowód doradztwa. Skill: risk-classifier. Patch przygotowany na `team/ai-data`, zastosowany tutaj.
- **Zmiana:** `rules/m3.yaml` (wzorzec `disclaimer`, reguły v4), `modules/m3.py` (reguły pomijają zdania z zastrzeżeniem, `strip_disclaimers()` przed LLM, reasons z cytatem-zastrzeżeniem odrzucane), prompt `m3-v4`, 3 testy. Pytest 120 passed.
- **Do sprawdzenia przez człowieka:** reanaliza dokumentu 99 na żywym stosie i `/findings/65`. Starsze findings M3 zostają na v3 do reanalizy.

## 2026-11-22 — #83 (M1 reklamujący i score) i #90 (analyze failed)
- **Zlecono:** przejrzeć otwarte PR-y (Haiku, przegląd wydajności PR #93), domknąć #83 po stronie ai-core, przejrzeć lokalne zmiany i wystawić PR. Skill: `risk-classifier`.
- **Zmiany:** `db.resolve_advertiser()` (lookup + insert w jednej transakcji pod `pg_advisory_xact_lock`, normalizacja host/handle, encja `advertiser`/`finfluencer` z `is_authorized=false`) wołane z `pipeline` dla findingów M1; błąd bazy nie gubi findingu. Prompt `m1-v2` (jawne sygnały reklamy: link partnerski, wpis sponsorowany, #reklama), wagi M1 0.7/0.2/0.1. `OllamaClient` z semaforem `llm.max_concurrency` (= `OLLAMA_NUM_PARALLEL`), `AnalysisFailed.category` zamiast tekstu wyjątku w odpowiedzi, crash jednego modułu nie zabija pozostałych, cytaty > 600 znaków przycinane zamiast odrzucać moduł. Testy: `test_m1_advertiser.py`, `test_analysis_budget.py`; pytest 126 passed, ruff czysty.
- **Odstępstwo od skilla:** timeout Ollamy bez retry (na CPU retry tylko podwaja obciążenie); inne błędy transportu nadal z 1 retry.
- **Do sprawdzenia przez człowieka:** `/reanalyze?module=1` na gold secie przed/po na żywym Bieliku (brak Ollamy na tej maszynie). PR #93 (ai-data) dodaje `ensure_advertiser()`, który dubluje `resolve_advertiser()` — do uzgodnienia z ai-data.
- **Poprawki po review (Haiku, świeża sesja):** `/analyze-text` zwraca w 502 tylko kategorię błędu; backoff między retry poza slotem Ollamy; lookup domeny reklamującego normalizuje schemat i ścieżkę jak `entity_match._norm_domain` (bez duplikatów encji); komentarz `budget_s` w `config.yaml` (collector 600 s). pytest 131 passed. Odrzucone uwagi review: „Ollama liczy dalej po anulowaniu” (Ollama przerywa przy rozłączeniu klienta), „embed omija semafor” (inny model, nie blokuje slotu LLM). Skill `risk-classifier` (retry przy timeout) do aktualizacji przez leada.

## 2026-11-22 — issue #83: M1 reklama sponsorowana poniżej progu
- **Zlecono:** ewidentna reklama finfluencera (bossa-ranking) miała score 0.31 i puste pole „Reklamujący”.
- **Przyczyna:** `llm_score` M1 sumuje tylko kryteria z `verdict=fail` z wagami 0.5/0.3/0.2. Sama reklama (`promotes_firm`) bez obietnic zysku dawała max 0.5 w llm, więc przy rules 0.9 i emb ~0.55 wychodziło ok. 0.59 (<0.6). Sygnały matchera wchodzą do score przez `rules` (0.9), więc nie to było problemem.
- **Zmiana:** wagi kryteriów M1 0.7/0.2/0.1 (`promotes_firm` jest rdzeniem M1), `m1-v2` (prompt: link partnerski i oznaczenie „sponsorowany” jako promowanie). Testy: reklama sponsorowana >= 0.6, neutralny news < 0.6.
- **Wynik (żywy Bielik):** bossa-ranking 0.593 → 0.707 (llm 0.475 → 0.665); neutralny news 0.16 bez flagi; inwestuj-z-marta 0.83. pytest 122 passed.
- **Do sprawdzenia przez człowieka:** brak finding-ów M1 dla gold w bazie (9/40 dokumentów, bez findingów) — pełny `/eval?module=1` po `/reanalyze` na zmienionych wagach.
- **Scalone z równoległą pracą na `origin/team/ai-core`:** wagi 0.7/0.2/0.1 i `m1-v2` powstały tam równolegle; przy merge przyjęto wersję zdalną (`resolve_advertiser`, `disclaimer` w `m3.yaml`), a z tej sesji zostały tylko testy M1 (reklama sponsorowana ≥ próg, niepewna promocja i neutralna wzmianka < próg) oraz test oferty obok zastrzeżenia M3. Znane ograniczenie zdalnej wersji M3: zdanie „to nie jest rekomendacja, ale kupuj X” jest w całości traktowane jak zastrzeżenie.

## 2026-11-22 — #84 próg w kalibracji nie przelicza flag
- **Zlecono:** naprawić niespójność progu z listą findingów. Orchestrator (Opus): Haiku (high) czyta issue i kod, Sonnet (medium) implementuje, drugi Sonnet (medium) robi review. Skill: `risk-classifier`.
- **Zmiany:** `POST /recompute-risk?module=1..3` przelicza `findings.risk_level` z zapisanego `score` i progu z `module_settings` jednym UPDATE (`db.RISK_CASE_SQL`), bez LLM i bez alertów. `risk_level()`: `high` tylko gdy `score >= max(risk.high, próg)`, bo wcześniej przy progu > 0.8 leciał alert dla findingu, którego `/eval` nie flagował. Test spójności `test_risk_consistency.py` (risk_level ⇔ `/eval` ⇔ SQL na siatce granic, alerty). pytest 432 passed, ruff czysty na zmienionych plikach.
- **Człowiek zdecydował:** endpoint w ai zamiast UPDATE w api (reguła w jednym miejscu), alerty bez wycofywania. Wymagania dla api (#4) i web (#5) wklejone ręcznie w #84.
- **Review:** brak blokerów. Notatka: score i próg są `real` (float4), więc finding leżący dokładnie na granicy może zmienić pasmo po przeliczeniu. Wynik zgodny z `/eval`.
- **Do sprawdzenia przez człowieka:** UPDATE na prawdziwym Postgresie w compose (SQL testowany w SQLite).

## 2026-11-22 — gold set lokalnie, LLM zwracał pustą listę kryteriów (llm = 0)
- **Zlecono (lead):** przebudować ai z nowym `gold.csv`, dokończyć `/analyze`, porównać `/eval?module=2` przy 0.4 i 0.8. Orchestrator (Opus): Haiku (high) przeszukał repo. Skill: `risk-classifier`.
- **Środowisko:** merge `origin/main` (fast-forward), cały stos lokalnie na Docker Desktop z `infra/docker-compose.gpu.yml` (RTX 3060). Załadowane tylko 43 dokumenty z fixtures `sample`; 77 URL-i `crawl` z `gold_urls_to_load.csv` nie ma w `sources.yaml` (pytanie do leada).
- **Bug:** we wszystkich modułach Bielik odpowiadał `{"criteria":[]}` (8 tokenów, ~350 ms), więc składowa llm = 0 i każdy score ≤ 0.32. Progi 0.4 i 0.8 dawały identyczne `/eval` (tp=0).
- **Zmiana:** `minItems`/`maxItems` = liczba kryteriów w schemacie JSON dla Ollamy (`json_schema_extra`, walidacja zostaje łagodna) w M1/M2/M3; `m1-v3`, `m2-v5`, `m3-v5`; test `test_llm_schema_items.py`. Koszt: ~45–50 s na dokument M2 na GPU zamiast ~0.4 s.
- **Wynik (43 dokumenty, żywy Bielik):** M2 0.4 → TP 2, FN 15; 0.8 → TP 1, FN 16. M1 0.4 → TP 5; 0.8 → TP 2. M3 0.4 → TP 2; 0.8 → TP 0. FP = 0 wszędzie. pytest 440 passed.
- **Do zrobienia przez innych:** ai-data — fikcyjna firma `przykladowy-broker.example` z gold setu M2 nie jest w seedzie jako podmiot z rejestru, więc 25 syntetycznych dokumentów M2 nie trafia do M2 (`route=[]`). Lead — sposób załadowania 77 URL-i `crawl`.

## 2026-11-22 — #95 domknięcie: zdanie „zastrzeżenie + prawdziwa rada”
- **Luka:** „To nie jest rekomendacja, ale kupuj akcje ABC, cena docelowa 50 zł.” było w całości traktowane jak zastrzeżenie (reguły pomijały zdanie, LLM go nie widział, powód z cytatem był odrzucany), więc formułka mogła ukryć realną poradę.
- **Zmiana (`m3.py`):** zastrzeżenie liczy się na poziomie klauzuli (podział na „ale/jednak/natomiast/lecz”, średnik, myślnik): `strip_disclaimers` usuwa tylko klauzulę z formułką, reguły pomijają dopasowania tylko w klauzuli-zastrzeżeniu, powód z cytatem jest odrzucany, gdy po usunięciu zastrzeżeń nie zostaje żaden sygnał doradztwa (`is_disclaimer_quote`). Czyste zastrzeżenie (dok. 99) działa jak wcześniej. 2 nowe testy, pytest 438 passed.
- **Do sprawdzenia przez człowieka:** `/reanalyze?module=3&document_id=99` i `/findings/65`; wzorce „ale/jednak” tylko dla polskiego tekstu.

## 2026-11-22 — #90 /health pokazuje stan modelu LLM
- **Zlecono:** przegląd issues ai-core, synchronizacja z origin, domknięcie niezrobionego z #90 (`/health` nie wiedział, czy Bielik się załadował). #95, #83, #70 (część ai) były już zrobione w PR #102.
- **Zmiana:** `OllamaClient.warmup()` zwraca bool, `app.state.llm_ready` ustawiany po warmupie, `/health` ma pole `llm` (`ok` / `loading` / `error`). Pole informacyjne: `status` i kod 503 zależą jak dotąd od Ollamy i Postgresa, więc healthcheck w compose się nie zmienia. Pytest 439 passed.
- **Nie zrobione:** fail-fast po nieudanym warmupie (świadomie, na CPU model może się ładować dłużej niż timeout).
- **Do sprawdzenia przez człowieka:** `curl localhost:8000/health` na żywym stosie; `docs/contracts.md` nie opisuje pola `llm` (zmiana przez team/api). `ruff check` zgłasza 2 × E501 w `ai/app/preprocess/entity_match.py` (plik ai-data) — zgłosić.

## 2026-11-22 — #83 merge main i test po poprawkach M1
- **Issue #83:** M1 dawał score 0.31 dla oczywistej reklamy finfluencera, puste „Reklamujący” i mylące „niespełnione”. Poprawki są już w PR #102: wagi M1 0.7/0.2/0.1, prompt `m1-v2` (linki partnerskie i oznaczenia sponsorowane liczą się jako promocja), `db.resolve_advertiser` wypełnia `findings.advertiser_entity_id`, w web `verdictLabel` pokazuje „wykryto” dla M1/M3.
- **Ta sesja:** merge `origin/main` bez konfliktów, ruff czysty, pytest 445 passed / 8 skipped / 1 xfailed, push do PR #102. Do zrobienia po merge: weryfikacja na żywo (przebudować ai, `/reanalyze?module=1`).
- **Dla ai-data:** `ensure_advertiser()` w `entity_match.py` dubluje `db.resolve_advertiser` i nie jest używane przez pipeline.
- **Proces:** plan zaakceptowany przez człowieka, issue przeczytał subagent Haiku, wykonanie przez subagenta Sonnet.
