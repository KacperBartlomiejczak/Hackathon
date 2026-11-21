# AI log — branch team/api

## Step 1–5: DB schema and contracts
- Asked Claude to: add `/internal/crawl-status`, `/sources` and the `crawl-source` queue to `docs/contracts.md`; write `infra/db/001_init.sql` (schema from contracts + indexes) and `002_seed_settings.sql`.
- Skills used: `data-contract`, `supabase-postgres-best-practices`.
- Added beyond the brief: indexes on foreign keys used in joins and on `documents.content_hash` (dedup).
- Human to verify: SQL not executed yet (no Docker/Postgres on this machine). Run both files on `pgvector/pgvector:pg16`.

## Contract hardening (before 17:30 merge window)
- Asked Claude to: add `UNIQUE (document_id, module)` on `findings`, `NOT NULL` on `finding_status_history.finding_id`, CHECKs on `crawl_runs.status`, `documents.status`, `module_settings.module` / `threshold`, and a `simhash` signed-64-bit note in `docs/contracts.md`.
- Skill used: `data-contract` (edited `001_init.sql` in place at the human's request instead of adding a migration).
- Verified: `001` + `002` ran with `ON_ERROR_STOP=1` on a throwaway `pgvector/pgvector:pg16` container (removed afterwards); negative tests hit every new constraint; duplicate finding fails, `ON CONFLICT (document_id, module)` upsert works.
- Follow-ups for others: ai-core must upsert findings and cast simhash u64<->i64; everyone must `docker compose down -v` to pick up the new constraints.

## Step 6: api/ skeleton
- Asked Claude to: scaffold `api/` (Node 22, TS strict, Fastify, CORS, rate limit, pino with `redact`, zod env config, `GET /health`, ESLint `no-console`, non-root Dockerfile).
- Skill used: `dependency-guard` (exact pins, licences checked on npm, `npm audit` = 0 vulnerabilities, `api/DEPENDENCIES.md`).
- Decisions: TypeScript 5.9.3 (same as collector, not 7.x), `@types/node` 22.x, base image `node:22.23.5-bookworm-slim`.
- Verified: lint, build, `/health` 200, `redact` hides authorization / x-internal-token / cookie / token / password, `no-console` fails on `console.log`, image runs as `node` and is `healthy`.
- Human to verify: env vars api expects (`INTERNAL_TOKEN` required; `PORT`, `LOG_LEVEL`, `WEB_ORIGIN` optional) must land in `.env.example` (#6).
