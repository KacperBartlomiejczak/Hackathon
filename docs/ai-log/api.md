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

## Steps 17-18: settings, /eval proxy, GET /sources, POST /sources/:id/run
- Asked Claude to: add `GET/PUT /settings/modules/:module` (zod: module 1|2|3, threshold + weights 0-1), `GET /eval` proxy to `${AI_URL}/eval`, `GET /sources` with the latest `crawl_run`, and `POST /sources/:id/run` (BullMQ `crawl-source`, payload `{sourceId, trigger:"manual"}`, 202). Plan approved first; human decided: weights as `{llm,rules,emb}` (not flat `w_*`), sum = 1 (±0.01), PUT = full replace, disabled sources can still be run manually.
- Skills used: `data-contract` (docs only: settings, /eval, /sources/:id/run shapes and error codes in `docs/contracts.md`; no DB change), `dependency-guard` (`ioredis@5.11.1`, MIT, OSV clean; bullmq 6 needs it as an optional peer). Claude stopped mid-task and re-planned when it found the missing driver; human approved the new dependency.
- Decisions: config `AI_URL` (base, default `http://ai:8000`), `EVAL_TIMEOUT_MS`, `VALKEY_URL` with `REDIS_URL` fallback; /eval passes ai status + body 1:1, 502 when ai is unreachable; queue uses `enableOfflineQueue:false` + 3 s timeout so a dead Valkey gives a fast 503; api does not emit `crawl:status` (collector owns `crawl_run`).
- Bug caught by the tests: drizzle with `casing: snake_case` rendered `${sources.id}` inside the correlated subquery as a bare `"id"`, which resolved to `crawl_runs.id`, so every source showed the same `lastRun`. Fixed with an explicit `"sources"."id"`.
- Verified: typecheck, lint, build, `npm audit` (0 vulnerabilities), `grep console.` empty; 24 `app.inject` checks against a scratch DB from `001`+`002` and a throwaway Valkey 8.1.12 (both removed afterwards), with a fake ai server: settings 200/400, persisted PUT, /eval 200/501 pass-through/400/502, sources lastRun (newest / null / failed+error), run 202 + job read back from Valkey, 404/400, 503 within 3 s when Valkey is down.
- Follow-ups for others: web types for settings / eval / sources (`web/src/types`); lead/collector: worker on `crawl-source` (needs `ioredis` too with bullmq 6), creates `crawl_run` and posts `/internal/crawl-status`; ai-core: if ai reads `module_settings`, weights are `{llm,rules,emb}`; infra (#6): `AI_URL` / `VALKEY_URL` already in `.env.example`.

## Step 22: GET /export?format=csv|json + findings filters
- Asked Claude to: add `GET /export` with the same zod-validated filters as `GET /findings` (`module`, `risk`, `status`, `source`, `from`, `to`, `q`), per-module columns (M1/M2/M3 + a universal set when `module` is missing), CSV with UTF-8 BOM and RFC 4180 escaping, JSON variant, spec in `docs/contracts.md`. Plan approved first; human decided: `format` required (400 without it), file name always `findings.csv`/`findings.json`, keep CSV formula-injection protection.
- Skill used: `data-contract` (the Skill tool did not list the project skill, so Claude followed `.claude/skills/data-contract/SKILL.md` by hand; docs only: `/export` params, columns, mapping, CSV/JSON format and truncation in `docs/contracts.md`; no DB change). No new dependencies (CSV writer is ~15 lines).
- Decisions: filters extracted to `buildFindingsWhere()` and shared by both endpoints, so they cannot drift apart; cap at 10 000 rows (`X-Export-Truncated: true` + `truncated` in JSON + pino warn); CRLF line endings; cells starting with `= + - @ TAB CR` get a leading `'`; `reasons` jsonb read defensively (malformed value → empty lists, row still exported); `score` with 2 decimals in CSV, raw in JSON; lists as arrays in JSON and joined (`; ` criteria, ` | ` quotes) in CSV.
- Deviation from the plan, caught by Claude while coding: in the plan M3 "Frazy doradcze" and "Cytaty" both came from `quote`, which gave two identical columns. Changed to phrases = `criterion` and quotes = `quote` (same pattern as M2). Needs a quick human check.
- Verified: typecheck, lint, build, `grep console.` empty; 63 checks with `app.inject` against a scratch DB from `001`+`002` (dropped afterwards): BOM bytes, headers, RFC 4180 round-trip (Polish chars, commas, quotes, newlines), formula prefix, M1/M2/M3/universal columns, JSON shape, filter parity with `GET /findings` for 9 filter combinations, 400 for 7 bad inputs; truncation with 10 101 rows (CSV 3.5 MB / ~1 s, JSON 4.4 MB / ~0.5 s).
- Follow-ups for others: web (#5) adds an "Eksport" button as a link to `/export?format=csv&<current filters>` and the JSON type in `web/src/types`. Not affected: collector, ai.

### Potential issues (to triage)
1. **RESOLVED (human chose `;`):** Polish Excel and the `,` separator. With Polish regional settings Excel uses `;` as the list separator, so a double-clicked `findings.csv` may put everything in column A (the BOM fixes the characters, not the separator). Options: `;` as the separator (common in PL reports), or a `delimiter=comma|semicolon` param. `sep=,` in the first line breaks BOM detection in Excel, so it is not a fix. Check on a PL Windows machine before deciding.
2. **Formula prefix shows a literal `'` in Excel.** When a CSV is opened, Excel does not hide the apostrophe, so handles look like `'@lukasz_inwestuje`. Accepted trade-off (security > cosmetics); possible later fix: prefix only when the cell also contains `(`/`!`, or strip `@` from handles.
3. **Verdict mismatch ai-data ↔ ai-core.** `ai/app/preprocess/entity_match.py` writes `verdict: "detected"|"unverified"`, but `Verdict` in `ai/app/models.py` is `pass|fail|unclear`. Export treats every verdict ≠ `pass` as a hit, so it works, but `FindingCreate` validation may reject those reasons. Owners: ai-core + ai-data.
4. **`q` filter without an index.** `ILIKE '%…%'` on `documents.text_clean` is a sequential scan, which gets slower with many documents (affects `/findings` and `/export`). Possible fix: `pg_trgm` + GIN index in `infra/db/` (only if it is slow on real data).
5. **Export is built in memory.** 10 000 rows ≈ 4 MB in RAM and one response; for bigger exports switch to a DB cursor + stream. Also consider a lower per-route rate limit for `/export` in step 24 (hardening); the global limit is now 300/min.
6. **Web types.** `web/src/types` does not have the `/export` JSON shape yet (owner: #5).

## Step 22 follow-up: CSV for Polish Excel
- Asked Claude to: switch the CSV delimiter to `;` (human decision after Claude flagged issue 1 above). Claude also switched `score` in CSV to a decimal comma (`0,83`), because Polish Excel reads `0.83` as text when the delimiter is `;`; JSON keeps raw numbers.
- Skill used: `data-contract` checklist by hand (docs only: CSV format paragraph in `docs/contracts.md`).
- Verified: typecheck, lint, build, `grep console.` empty; the 64-check `app.inject` suite re-run on a fresh scratch DB (parser switched to `;`, new checks for quoting `;` and the decimal comma), DB dropped afterwards.
- Still to check by a human: double-click `findings.csv` in Excel with Polish regional settings (columns split, Polish characters, score as a number).
