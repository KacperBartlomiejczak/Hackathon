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

## Steps 7-9: Drizzle schema, GET /findings, GET /findings/:id
- Asked Claude to: map all tables to Drizzle (`casing: snake_case`, CHECK/UNIQUE/indexes as in `001_init.sql`), validate `DATABASE_URL` and S3 env with zod, add the list endpoint (filters, `q` ILIKE, pagination, joins) and the detail endpoint (reasons, full `text_clean`, presigned screenshot 15 min, status history). Plan approved before any code.
- Decisions: `source` = `documents.source_kind`; `from`/`to` = `findings.created_at`; `S3_PUBLIC_ENDPOINT` signs URLs for the browser (docker-internal host is unreachable from it); presign failure gives `screenshotUrl: null` + warn, not 500. No new dependencies; contract text in `docs/contracts.md` not changed yet.
- Verified: typecheck, lint, build; 11 requests via `app.inject` against local `pgvector/pgvector:pg16` with test rows (filters, `%`/`_` escaping, pagination, 400 on bad input, 404, presign with `X-Amz-Expires=900`); `grep console.` empty. Test rows removed afterwards.
- Human to verify: presigned URL against real SeaweedFS (no S3 running here); the running `investwatch-postgres` container was created from an older `001_init.sql` without `UNIQUE (document_id, module)` - run `docker compose down -v`.
- Follow-ups for others: #6 must add `DATABASE_URL`, `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `INTERNAL_TOKEN` to `.env.example` and compose; #5 gets response shapes after the contract is updated.
