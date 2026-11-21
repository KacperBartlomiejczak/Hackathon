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
