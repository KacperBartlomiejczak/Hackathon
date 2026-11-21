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
2. (#25) **Formula prefix shows a literal `'` in Excel.** When a CSV is opened, Excel does not hide the apostrophe, so handles look like `'@lukasz_inwestuje`. Accepted trade-off (security > cosmetics); possible later fix: prefix only when the cell also contains `(`/`!`, or strip `@` from handles.
3. (#26) **Verdict mismatch ai-data ↔ ai-core.** `ai/app/preprocess/entity_match.py` writes `verdict: "detected"|"unverified"`, but `Verdict` in `ai/app/models.py` is `pass|fail|unclear`. Export treats every verdict ≠ `pass` as a hit, so it works, but `FindingCreate` validation may reject those reasons. Owners: ai-core + ai-data.
4. (#27) **`q` filter without an index.** `ILIKE '%…%'` on `documents.text_clean` is a sequential scan, which gets slower with many documents (affects `/findings` and `/export`). Possible fix: `pg_trgm` + GIN index in `infra/db/` (only if it is slow on real data).
5. (#28) **Export is built in memory.** 10 000 rows ≈ 4 MB in RAM and one response; for bigger exports switch to a DB cursor + stream. Also consider a lower per-route rate limit for `/export` in step 24 (hardening); the global limit is now 300/min.
6. (#29) **Web types.** `web/src/types` does not have the `/export` JSON shape yet (owner: #5).

## Step 22 follow-up: CSV for Polish Excel
- Asked Claude to: switch the CSV delimiter to `;` (human decision after Claude flagged issue 1 above). Claude also switched `score` in CSV to a decimal comma (`0,83`), because Polish Excel reads `0.83` as text when the delimiter is `;`; JSON keeps raw numbers.
- Skill used: `data-contract` checklist by hand (docs only: CSV format paragraph in `docs/contracts.md`).
- Verified: typecheck, lint, build, `grep console.` empty; the 64-check `app.inject` suite re-run on a fresh scratch DB (parser switched to `;`, new checks for quoting `;` and the decimal comma), DB dropped afterwards.
- Still to check by a human: double-click `findings.csv` in Excel with Polish regional settings (columns split, Polish characters, score as a number).
- Issues 2-6 from the list above created on GitHub as KacperBartlomiejczak/Hackathon#25-#29 (human approved).

## Steps 24-25: hardening — issues #31, #28, #27, #25, #15 + error format + audit
- Asked Claude to: close every open GitHub issue owned by api (#31, #28, #27, #25, #15) in PR #32, plus two hardening items from `docs/team/4-api.md`: one `{ error, message }` error format without stack traces, and `npm audit --audit-level=high` saved to `api/SECURITY.md`. Plan approved first. The human picked the defaults: strip `@` from handles in CSV (#25), and add `pg_trgm` only if the measurement shows a clear gain (#27).
- Skill used: `data-contract`. The Skill tool did not list the project skill, so Claude followed `.claude/skills/data-contract/SKILL.md` by hand. `docs/contracts.md` now covers the error format, rate limits, CORS exposed headers, `@` in the CSV handle columns and the trigram indexes. `api/src/db/schema.ts` mirrors the new indexes. No column changes and no new dependencies.
- Changes:
  - #31: CORS `exposedHeaders: Content-Disposition, X-Export-Truncated`, so web gets `findings.csv` from the API instead of its own default name. The formula guard (incl. TAB/CR) was already in step 22. `=HYPERLINK` is now covered by a committed unit test.
  - #28: `/export` has its own 10/min per-IP limit (global stays 300/min), 429 with `Retry-After`. No streaming, the 10 000-row cap is enough.
  - #27: `infra/db/003_trgm.sql` with `pg_trgm` + GIN `gin_trgm_ops` on `documents.title` and `documents.text_clean`. It sits next to 001/002, not in `infra/db/migrations/` as the skill says, because compose only runs top-level files from `docker-entrypoint-initdb.d`.
  - #25: column flag `handle` (Reklamujący, Podmiot). CSV drops the leading `@` before the formula guard, so `@=1+1` still becomes `'=1+1`. JSON keeps the `@`.
  - Error handler: 4xx keep their status, with `error` mapped by status (`unauthorized`, `not_found`, `payload_too_large`, `unsupported_media_type`, `rate_limited`, …). 5xx always return `{error:"internal", message:"Internal server error"}`. A not-found handler covers unknown routes (Fastify's default body was `{message,error,statusCode}`). The `/internal/*` 401 now also has a `message`. 4xx are logged at `warn` without a stack, 5xx at `error` with the stack, only in pino.
  - Tests: `npm test` (`node --import tsx --test`, no new dependencies) with 15 unit tests for `csvCell`/`toCsv`. These are the first tests committed in `api/`, earlier suites only lived in a scratchpad.
- #27 measurement (scratch pgvector:pg16, 50 000 documents × ~1.5 KB, the same query shape as `/findings?q=`):
  - Rare phrase (25 hits): 1 625 ms → 45 ms (count) and 1 739 ms → 3 ms (first page).
  - A word present in every document: no gain, 1.7 s → 2-3 s (bitmap heap scan of all rows).
  - Cost: index build 46 s, 70 MB GIN on `text_clean` (table is 67 MB), insert about +1.6 ms per document (1 000 docs: 66 ms → 1 645 ms).
  - Kept the index, because real searches are firm names and phrases, i.e. selective.
- #15 result (real SeaweedFS `chrislusf/seaweedfs:3.96`, scratch container):
  - The presigned URL signed for `S3_PUBLIC_ENDPOINT` downloads in a plain `fetch` (200, same bytes, `image/png`, `X-Amz-Expires=900`). A missing object gives 404.
  - Found two problems for infra (#6). First, `.env.example` has no `S3_PUBLIC_ENDPOINT`, so URLs are signed for `http://seaweedfs:8333`, which the browser cannot open. The fix is `S3_PUBLIC_ENDPOINT=http://localhost:8333`. Second, SeaweedFS runs without `-s3.config`, so it does not verify signatures at all: a tampered signature and an unsigned GET both return 200.
- Verified: typecheck, lint, build, `grep console.` empty, `npm test` 15/15, `npm audit --audit-level=high` 0 vulnerabilities (report in `api/SECURITY.md`). 62 `app.inject` checks against scratch Postgres (001-003), Valkey 8.1.12 and SeaweedFS 3.96, all removed afterwards:
  - #15 presign, CORS (allow and expose headers, foreign origin, preflight), #28 limit (10 × 200, 11th 429, other routes unaffected).
  - Error format 400/401/404/409/413/415/429/500 (DB down: no driver text).
  - The export suite with #25 handles, export/findings parity for 9 filters, smoke of every endpoint incl. a job read back from Valkey.
  - The token never appeared in the logs.
- Follow-ups for others: infra (#6) adds `S3_PUBLIC_ENDPOINT=http://localhost:8333` to `.env.example` and decides on `-s3.config`. Everyone runs `docker compose down -v` (or `psql -f infra/db/003_trgm.sql`) to get the new indexes. web (#5): nothing required, `exportFindings()` now receives the real file name.

## Issue check after PR #40 and #38: #45, #15, #42
- Asked Claude to: check which open issues concern api and fix them. The human gave the go-ahead directly in chat ("zrób to, sprawdź jeszcze raz issues i napraw je"), no separate plan round.
- Skill used: `data-contract` (followed `.claude/skills/data-contract/SKILL.md` by hand). Only `docs/contracts.md` changed: no table, column or endpoint in `api/`, nothing for others to update.
- #45: `POST /analyze-text` added to the AI section of `docs/contracts.md` from `ai/app/models.py` and `ai/app/main.py`: demo-only and internal, saves nothing, sends no alert, no token. Decision (lead's recommendation): api does not proxy it and web does not call it; using it from web needs a contract change first. Errors are FastAPI `{detail}`, not the api `{error, message}` format.
- #15: verified on the real compose config from `main` (`.env` = `.env.example`), project `iwverify` with api + postgres + valkey + seaweedfs + s3-init (postgres host port dropped by an override, because a local postgres already held 5432). PNG uploaded through the S3 API, document + finding inserted, `GET /findings/1` returns `screenshotUrl` on `localhost:8333` with `X-Amz-Expires=900`; it opens in a browser (200, `image/png`, same bytes). A missing object gives 404. Stack and volumes removed afterwards.
- Found on the way: a Windows clone made before `.gitattributes` (PR #40) keeps CRLF in `infra/seaweedfs/init-bucket.sh` after `git merge origin/main`, because merge does not rewrite unchanged files. `s3-init` exits 2 and api never starts. Fresh clones are fine (blob is LF). One-time fix: `sed -i 's/\r$//' infra/seaweedfs/init-bucket.sh`.
- #42 (api part, answer only): `documents.url_hash` = `sha256(url)` without normalisation, `UNIQUE`, and the collector upserts on it, so the URL is a stable key across re-seeds and `documents.id` is not. Suggested for ai-data: `gold.csv` keyed by `url`, `eval.py` joins on `url_hash`. No schema change needed.
- Human correction: Claude ran `gh pr checkout 40` to read PR #40, which detached HEAD. HEAD was pointed back to `team/api` and, after the human's OK, the working tree was restored with `git restore --source=HEAD --staged --worktree -- :/`. PRs are now read via `git fetch origin pull/N/head`.

## Issues #55 (M1 periodic update) and #54 (M1/M2/M3 aggregator)
- Asked Claude to: check which open issues concern api and fix them. Claude found #55 and #54 (both `team:api`, shared with other teams), wrote a plan per CLAUDE.md, and the human accepted it ("Akceptuję plan, działaj"). The human confirmed the DB trigger and computing `isActive` against `ok` runs, and asked to keep `004_seen_tracking.sql` next to `003_trgm.sql` so docker runs it on its own.
- Skill used: `data-contract` (followed by hand). The migration stays in `infra/db/`, not `infra/db/migrations/` as the skill says, because `docker-entrypoint-initdb.d` does not read subfolders.
- #55: `infra/db/004_seen_tracking.sql` adds `documents.first_seen_at` / `last_seen_at`, filled by trigger `documents_track_seen`. The collector already upserts on `url_hash` and overwrites `fetched_at` on every re-crawl, so `collector/` needs no change. api computes `isActive` and returns it in `/findings`, `/findings/:id` and `/documents*`. The M1 export gets two columns: „Ostatnio widziana” and „Aktywna” (`tak`/`nie`).
  - Change found while coding (same rule, same files): the collector marks a run `ok` right after queueing its items, before they are fetched. So `isActive` ignores runs that finished less than 1 h ago; without that, every ad of a source would look inactive for a few minutes after each crawl.
- #54: `api/src/routes/documents.ts` = the named result aggregator. `GET /documents` (same filters as `/findings`, one object per document) and `GET /documents/:id` (with `reasons`). Each object has `document`, `modules {"1","2","3"}` and `overall` (maxScore, riskLevel, flaggedModules, findingsCount, lastFindingAt). The aggregation is the pure function `aggregateModules`.
- Bug caught in verification: `/documents/3`, whose source had never been crawled, returned `isActive: false`. In a single-table select drizzle renders columns without the table name, so the subquery compared `crawl_runs.source_id` with itself. Fixed by writing the table names out in `api/src/db/seen.ts`, plus a regression test on the generated SQL.
- Verified:
  - typecheck, lint, `grep console.` empty, `npm test` 22/22 (new: 4 for `aggregateModules`, 1 for the SQL, 2 for the export).
  - Scratch `pgvector/pgvector:0.8.7-pg16` with `infra/db` mounted as initdb: 001-004 ran on their own. Trigger checked:
    - insert: first = last = fetched;
    - re-crawl upsert: first unchanged, last moves forward;
    - older retry: last does not move back;
    - direct write to `first_seen_at`: ignored.
  - Re-running 004 is a no-op. On a 001-003 database that already has rows, 004 backfills both columns from `fetched_at`.
  - api run locally against that database. curl results for `/documents`, `?module=2`, `/documents/:id` (with and without findings), 404/400, `/findings`, `/findings/1` and the M1 CSV/JSON exports all match the contract. `isActive`: seen again → true, missed by a later `ok` run → false, source never crawled → true. Container removed afterwards.
- Not done (other teams' parts of these issues): web view of `/documents` (#5), aggregator description in `docs/` and on the slide (#6). Detecting a content change under the same URL needs a content hash in the collector (lead).

## 2026-11-21: web/Dockerfile libxml2 (Issue #44, web part)
- Asked: check open web issues and fix them. Left for web: one HIGH CVE (`libxml2 2.13.9-r2`) in the `nginx:1.30.7-alpine` runtime image (#44); #51 (drop social sources from the filter) waits for the lead's decision.
- Out of my scope (`web/` is team/web). The human chose to commit it on team/api, but `.githooks/pre-commit` blocked the commit (web/ files on team/api) and `--no-verify` is denied, so it was first posted as a patch in #44. Later the user got full access to all team dirs and a local hook copy (`core.hooksPath=.git/hooks-local`) allows it, so it was committed on team/api; details in `docs/ai-log/web.md`.
- Change (patch): `RUN apk upgrade --no-cache libxml2` in the runtime stage of `web/Dockerfile`, result noted in `web/SECURITY.md`.
- Verified: `docker build` of `web/` OK, `libxml2-2.13.9-r3` in the image, Trivy 0.76.2 CRITICAL/HIGH = 0, `/`, `/findings`, `/calibration` return 200.

## 2026-11-21: web issues #51 (web part) and #44 (docs), with full access
- Asked: fix the web issues myself. Rules applied: `docs/team/5-web.md` for `web/`, `docs/team/6-infra-pitch.md` for `docs/`, `README.md`, `.env.example`. Plan accepted without the clean-start check.
- #51: the „Źródło” filter lists only kinds that have a source in `GET /sources` (plus the kind already in the URL); if `/sources` fails it shows every kind. Social kinds stay in the types, so a future TikTok/Instagram adapter appears in the filter by itself. The adapter decision stays with the lead.
- #44: `docs/DEPENDENCIES.md` and `docs/SECURITY.md` show the new web images and Trivy results; `OLLAMA_NUM_PARALLEL=1` in `.env.example` with a README note (2 = M1 and M3 in parallel, more RAM/VRAM; not tested, so default stays 1).
- Verified: web Docker build (tsc + vite) OK; scratch Postgres with sources web/youtube/sample + local api: filter shows exactly those 3, `?source=tiktok` keeps tiktok selected, api down → full list. Browser console clean while the api was up. Scratch containers removed.
- Not done: clean start from zero (skipped by the human), GitHub Actions (`.github/` is outside the team/api hook).
