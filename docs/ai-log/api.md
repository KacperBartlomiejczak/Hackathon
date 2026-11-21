# AI log — branch team/api

## Step 1–5: DB schema and contracts
- Asked Claude to: add `/internal/crawl-status`, `/sources` and the `crawl-source` queue to `docs/contracts.md`; write `infra/db/001_init.sql` (schema from contracts + indexes) and `002_seed_settings.sql`.
- Skills used: `data-contract`, `supabase-postgres-best-practices`.
- Added beyond the brief: indexes on foreign keys used in joins and on `documents.content_hash` (dedup).
- Human to verify: SQL not executed yet (no Docker/Postgres on this machine). Run both files on `pgvector/pgvector:pg16`.
