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
