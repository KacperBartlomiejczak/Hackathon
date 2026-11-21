# AI log: ai-data

## 2026-11-21 — entities.csv from KNF register
- Task: seed `ai/seed/entities.csv` (name, aliases, type, is_authorized, register_ref, nip, official_domains, social_handles).
- Source: knf.gov.pl lists "Domy maklerskie", "Banki prowadzące działalność maklerską", "Notyfikacje zagranicznych firm inwestycyjnych" (oddziały + bez oddziału). Scraped with a throwaway script (not committed).
- Result: 79 rows (38 PL, 41 foreign picked by hand from 719 notified firms: brands advertising in Polish).
- Aliases are separated by `|`; `official_domains` likewise. `register_ref` is the KNF list name (no register ID on the pages); `nip` empty.
- Human must verify: domains (written from memory by the assistant, not checked), 16 rows without domain, `social_handles` empty for all rows.
