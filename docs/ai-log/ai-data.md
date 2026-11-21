# AI log: ai-data

## 2026-11-21 — entities.csv from KNF register
- Task: seed `ai/seed/entities.csv` (name, aliases, type, is_authorized, register_ref, nip, official_domains, social_handles).
- Source: knf.gov.pl lists "Domy maklerskie", "Banki prowadzące działalność maklerską", "Notyfikacje zagranicznych firm inwestycyjnych" (oddziały + bez oddziału). Scraped with a throwaway script (not committed).
- Result: 79 rows (38 PL, 41 foreign picked by hand from 719 notified firms: brands advertising in Polish).
- Aliases are separated by `|`; `official_domains` likewise. `register_ref` is the KNF list name (no register ID on the pages); `nip` empty.
- Human must verify: domains (written from memory by the assistant, not checked), 16 rows without domain, `social_handles` empty for all rows.

## 2026-11-21 — KNF converter script
- Task: replace the one-off scratch build with a repeatable `ai/seed/build_entities.py` (raw dumps in `ai/seed/raw/` + hand-written `overrides.json` -> `entities.csv`).
- Skill: risk-classifier (seed data). No new dependencies (stdlib).
- Result: 86 rows (38 PL, 10 branches + 38 foreign brands). Aliases = rule-generated variants (legal form stripped, "Dom Maklerski" prefix, "DM X") + hand-written brand aliases.
- Human must verify: domains and brand aliases in `overrides.json` (from memory, not checked); 23 rows have no domain; `social_handles` empty; the 7 extra branch rows (Convera, EXT, Finax, Instant Trading, Jefferies, Tradition, Wood & Company) are not retail brokers, delete if noisy; short aliases (IG, XM, XTB, ING) will need word-boundary matching in M1.

## 2026-11-21 — preprocessing, dedup, embed, entity seed
- Task: `clean_text()`, dedup (SHA-256 + simhash -> `duplicate_of`), `embed()` via Ollama bge-m3, idempotent `entities` seed. Plan approved before coding.
- Skills: risk-classifier (preprocessing area), dependency-guard (listing only, `ai/DEPENDENCIES.md`).
- Result: `ai/app/preprocess/{clean,dedup}.py`, `ai/app/embeddings.py`, `ai/seed/seed_entities.py`, `ai/tests/test_preprocess.py` (7 pass, pure functions only).
- Own 64-bit simhash (word 3-grams, blake2b) instead of the `simhash` package: no dependency.
- Human must verify: `HAMMING_THRESHOLD` and `MIN_WORDS_FOR_SIMHASH=20` on real data.
- Packages needed (for ai-core's pyproject + `ai/DEPENDENCIES.md`): trafilatura (Apache-2.0), httpx (BSD-3), asyncpg (Apache-2.0; psycopg skipped, LGPL), pytest (MIT, dev). `pip-audit` not yet run.

## 2026-11-21 — integration tests (pgvector PG16 + Ollama bge-m3)
- Task: run dedup, seed and embed against real services. Added `ai/tests/conftest.py` (DDL copy of `entities`/`documents` from contracts.md, keep in sync with infra/db) and `test_integration.py`. Tests skip if Postgres/Ollama are unreachable.
- Found: `HAMMING_THRESHOLD=3` missed a near-duplicate with one changed word (distance 5-6 on a ~35-word post; unrelated text ~32). Raised to 6.
- Result: 11 tests pass: SQL `bit_count`, idempotent seed (2nd run = 0 inserted), duplicates never chosen as canonical, bge-m3 vector(1024) stored.
- Extra dev dependency: pytest-asyncio (MIT). Run with `--asyncio-mode=auto` (ai-core: set `asyncio_mode = "auto"` in pyproject).
- Human must verify: threshold 6 on real posts (an appended sentence gave 10, so it is not flagged).

## 2026-11-21 — M1 `match_entities()`
- Task: `ai/app/preprocess/entity_match.py` (+ `ai/tests/test_entity_match.py`, 8 tests). Plan approved first; skill risk-classifier. No new dependencies (re, difflib).
- API: `match_entities(text, url, author_handle, entities, document_id=None) -> list[M1Candidate]` (pure), `load_entities(conn)`. One candidate per authorized firm; none when publisher host/handle is the firm's own (M2 territory).
- Matching: name + aliases, Polish endings (up to 3 letters), fuzzy (ratio >= 0.88, alias >= 6 chars), short aliases (<= 4 chars: IG, XM, XTB, ING) need exact case and a promo anchor within 200 chars. Quote = sentence with the mention, exact substring of `text`, max 300 chars.
- `rules_score`: mention 0.4 + anchor 0.3 + publisher 0.2 (identified and channels known) / 0.1 (identified, firm channels unknown) / 0. `reasons[].verdict` is `detected` or `unverified` (contracts.md only shows `fail`; ai-core maps it). `advertiser_entity_id` is always None, ai-core fills it.
- Perf: ~0.17 s for 1000 words against 86 entities.
- Human must verify: `social_handles` empty for ALL firms and ~23 have no domain, so posts by a firm's own account look third-party (shown as `official_channels_known=False`, `unverified`). Firms sharing an alias (XTB S.A. and XTB Ltd, 3x Trading 212) give one candidate each for the same mention. Thresholds (0.88, 200 chars, 3 letters, weights) untuned. Ambiguous short aliases like "IG" still hit when an anchor is near.

## 2026-11-21 — embed() env vars
- Task: `embed()` reads `OLLAMA_BASE_URL` (default `http://localhost:11434`) and `OLLAMA_EMBED_MODEL` (default `bge-m3`); `OLLAMA_URL` removed. Considered switching to Bielik 4096-dim, rejected by the human: bge-m3 stays for embeddings, Bielik is the classification LLM only.
- Human must verify: 11 unit tests pass, the 4 integration tests were skipped after this rename (Docker daemon was off), rerun them once Docker is up. In compose the ai service needs `OLLAMA_BASE_URL=http://ollama:11434` (default is localhost).

## 2026-11-21 — `/eval` metrics
- Task: `evaluate()` in `ai/app/eval.py` (stored scores vs gold set, no LLM), empty `ai/eval/gold.csv` (header only, labels are the human's), `ai/tests/test_eval.py`, `findings` table added to the test DDL. Skill risk-classifier.
- API: `await evaluate(conn, "M2", 0.6) -> EvalResult(module, threshold, tp, fp, fn, tn, precision, recall, total, missing_findings)`; pure `compute_metrics()` underneath. Flagged = `score >= threshold`; several findings per document -> max score; division by zero -> 0.0; threshold outside [0, 1] -> ValueError; gold label must be 0 or 1, conflicting duplicates -> ValueError. Module accepts `M1`, `m1`, `1`.
- Documents in gold without a finding are scored 0 (not flagged) and counted in `missing_findings` (warning logged). A failed analysis therefore looks like a false negative; check this number before trusting recall.
- Result: 25 tests pass against pgvector PG16 and Ollama.
- Human must verify: label the gold set yourself (>= 40 per module); `contracts.md` writes `TP/FP/FN/TN` in upper case, `EvalResult` uses lower case, api and web must agree on the JSON keys; `document_id` in gold must be the `documents.id` from the DB.

## 2026-11-21 — unit tests for dedup, M1, eval + ruff
- Task: fill test gaps and get `ruff check` clean. Plan approved first. No new runtime dependencies (ruff only run via `uv run --with ruff`).
- Added: `ai/tests/test_dedup.py` (dedup() on an in-memory fake connection: SHA-256 exact, simhash near, different text, canonical original, short text), M1 test with real register data (official domain and subdomain not flagged, foreign domain flagged), hand-computed eval metrics test. Ruff `--fix` removed 11 needless `noqa: E402`.
- Result: 32 tests pass (against pgvector PG16 and Ollama), `ruff check .` clean with default rules.
- Not covered: official channel by social handle on real data, because `social_handles` is empty for every firm in `entities.csv`; handle logic is tested only with synthetic entities. `overrides.json` is not in the repo, so the test uses `entities.csv`. `ai/pyproject.toml` does not exist yet (ai-core), so `uv run pytest` and `uv run ruff check .` in `ai/` were run as `uv run --no-project --with ...`.

## 2026-11-21 — merge origin/main, ruff with ai-core config
- Task: merged `origin/main` (no conflicts; PR #3 was already merged), fixed 15 ruff errors under `ai/pyproject.toml` (line-length 110, E/F/I/B/UP/T20): 14 long lines wrapped, one lambda -> def, two duplicated `Entity(...)` comprehension lines wrapped. No behaviour change.
- Result: `ruff check .` clean, 37 tests pass (mine + ai-core `test_app.py`) against pgvector PG16 and Ollama.
- Still open (ai-core): tests need `pytest-asyncio` + `asyncio_mode = "auto"` (not in `ai/pyproject.toml`, so a plain `uv run pytest` fails at conftest; I ran `uv run --with pytest-asyncio pytest -p asyncio --asyncio-mode=auto`); `embed()` reads `OLLAMA_BASE_URL` while `main.py` and `.env.example` use `OLLAMA_URL`; Dockerfile does not copy `seed/` and `eval/`; `/analyze` and `/eval` are not wired.

## 2026-11-21 — embed() back to `OLLAMA_URL`
- `embed()` reads `OLLAMA_URL` (default `http://localhost:11434`, for local runs) and `OLLAMA_EMBED_MODEL` (default `bge-m3`), matching `main.py`, `.env.example` and the request in `docs/ai-log/ai-core.md`. `OLLAMA_BASE_URL` is gone; this supersedes the earlier rename note.

## 2026-11-21 — issue #26: M1 verdicts match `Verdict`
- `entity_match.py` reasons now use `fail` (signal found: firm mentioned, promo anchor, publisher not official) and `unclear` (firm's official channels unknown) instead of `detected`/`unverified`, so `Reason` / `FindingCreate` (`Verdict = pass|fail|unclear`) accept them. No contract change.
- Added `test_reasons_validate_against_contract_model` (validates every M1 reason with `app.models.Reason`). 33 tests pass, 5 integration skipped (no containers); ruff clean.

## 2026-11-21 — UKNF attachments (topics 1-3, risk criteria)
- Reviewed the 4 UKNF docx files. Attachments 1 and 2 (register definitions and 4 KNF register URLs) are already covered by `ai/seed/raw/knf_*.json` and `entities.csv`.
- Added `ai/eval/rubric.md`: 18 risk-information rules (art. 44 of Reg. 2017/565) for M2 and the art. 76/2/3 advisory definition for M3, as labelling rules for `gold.csv`. Labels stay human-made.
- Needs ai-core (outside this branch's scope): `ai/prompts/m2-risk-info/system.md` has 4 criteria vs. 18 in the UKNF resource; M3 prompt/rules should use the art. 76 definition. Suggested start: text-only rules 1, 2, 3, 6, 9, 10, 14, 15, 17, 18.

## 2026-11-21 — issue #56 (ai-data part)
- Added `ai/app/preprocess/README.md`: tokenization (dedup word tokens, simhash 3-grams, bge-m3 subword tokenizer) and embeddings as a preprocessing step. Facts checked against clean.py, dedup.py, embeddings.py. Infra can link it from the architecture description.
