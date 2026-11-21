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
- Human must verify: `HAMMING_THRESHOLD=3` and `MIN_WORDS_FOR_SIMHASH=20` on real data; `dedup()` SQL (`bit_count((simhash # $1)::bit(64))`, needs PG14+) and `seed_entities()` NOT run against a DB (no Docker on this machine); `embed()` NOT run against Ollama.
- Packages needed (for ai-core's pyproject + `ai/DEPENDENCIES.md`): trafilatura (Apache-2.0), httpx (BSD-3), asyncpg (Apache-2.0; psycopg skipped, LGPL), pytest (MIT, dev). `pip-audit` not yet run.
