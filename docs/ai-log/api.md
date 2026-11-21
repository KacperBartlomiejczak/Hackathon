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

## Contract: GET /findings and GET /findings/:id response shapes
- Asked Claude to: document query params (incl. new `pageSize`) and the list/detail JSON in `docs/contracts.md`, matching the implemented endpoints.
- Skill used: `data-contract`. Additive, docs only: no DB migration, no schema change; `api/src/types/findings.ts` already matches.
- Follow-ups for others: web updates `web/src/types` (list + detail shapes, `pageSize`). collector and ai-core are not affected.

## Step 11: Socket.io + POST /internal/alerts, /internal/crawl-status
- Asked Claude to: attach Socket.io to Fastify (CORS = `WEB_ORIGIN` only), add `X-Internal-Token`-guarded internal routes with zod validation, emit `alert:new` / `crawl:status`. Plan approved first; human approved the `/internal/alerts` body (no DB lookup, `riskLevel` must be `high`), 1:1 `crawl:status`, rate limit off for `/internal/*`.
- Skill used: `data-contract` (docs only: `/internal/alerts` body + 202/400/401 responses added to `docs/contracts.md`; no DB change). No new dependencies.
- Decisions: token compared with `timingSafeEqual` on SHA-256 digests (equal-length buffers); auth runs in `onRequest`, before body parsing; logs carry only ids/status, never headers or body.
- Verified: typecheck, lint, build; real server on a random port: 401 without/with wrong/short token, 400 on `riskLevel:"low"` and bad crawl status, 202 + both events received by a Socket.io polling client; CORS header is `WEB_ORIGIN` even for a foreign Origin; token string absent from logs; `grep console.` empty; clean shutdown.
- Follow-ups for others: ai-core sends the body from `docs/contracts.md` with `X-Internal-Token` (ai/app/models.py); collector sends `/internal/crawl-status` with the token; web types for `alert:new` / `crawl:status` (web/src/types); #6 `INTERNAL_TOKEN` in `.env.example` and compose.

## Steps 14-15: PATCH /findings/:id/status, GET /stats/trend, GET /stats/summary
- Asked Claude to: add the status endpoint (zod, allowed transitions `new -> in_review -> confirmed|dismissed`, one DB transaction for `findings.status` + `finding_status_history`, emit `finding:updated`), plus trend (`date_trunc`, `bucket=day|hour`) and summary (per module / risk / source kind / status). Plan with proposed response shapes approved first.
- Skill used: `data-contract` (docs only: PATCH body/responses, trend, summary and `finding:updated` payload in `docs/contracts.md`; no DB change, no new dependencies).
- Decisions: row locked with `SELECT ... FOR UPDATE` so concurrent PATCHes cannot both pass the transition check; no re-open; `changedBy` optional (max 100, default null); `note` only logged by pino (no column); trend does not zero-fill gaps; emit happens after commit.
- Human caught/verified: Claude's first trend query returned 500 (bound `date_trunc` parameter differs between SELECT and GROUP BY) - fixed by inlining the zod-validated enum literal. Re-tested after the fix.
- Verified: typecheck, lint, build; `app.inject` against a scratch DB built from `001_init.sql` (dropped afterwards): 200/409 (skip, same status, re-open)/404/400 cases, 2 history rows, 2 `finding:updated` events received by a raw Socket.io polling client, trend/summary counts match manual `GROUP BY`; `grep console.` empty.
- Follow-ups for others: web updates `web/src/types` (PATCH, trend, summary, `finding:updated`) and listens to `finding:updated`; web fills empty trend buckets itself. Not affected: collector, ai.
