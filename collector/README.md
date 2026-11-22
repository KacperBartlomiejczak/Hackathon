# collector

Fetches public content about financial instruments and services, stores raw HTML and screenshots in S3 (SeaweedFS), writes a row to `documents` and calls `POST ai:8000/analyze/{id}`.
Node 22, TypeScript, Playwright, BullMQ on Valkey.

## Quick Start

Runs as part of the whole stack (from the repo root):

```bash
cp .env.example .env
docker compose up --build
```

Locally (needs running postgres, valkey and seaweedfs from compose):

```bash
cd collector
npm i
npm run dev
```

On start the collector upserts `sources.yaml` into the `sources` table, registers a BullMQ scheduler for every enabled source with `cron`, and (with `CRAWL_ON_START=true`) queues one crawl for each enabled source without `cron` (sample data).

## Sources (`sources.yaml`)

| `kind` | What it does |
|---|---|
| `sample` | Offline fixtures from `fixtures/sample/` (demo, no network). |
| `web` | Playwright: start page plus up to 20 same-host links matching finance keywords. Screenshot and HTML to S3. |
| `youtube` | Public channel RSS (last 15 videos: title, description). No API key. |
| `facebook` | Public pages without login: page = `og:title` + `og:description`, posts only when a permalink is visible. Pages behind the login wall end as an error in `crawl_runs`. |
| `tiktok` | Single public videos via oEmbed. Profile listing is empty for headless browsers, so profiles are not crawled. |

Fields: `name`, `start_url`, `enabled`, `cron` (5-field, Europe/Warsaw; `null` = manual only), `module_hint`.
Adding a source = a new entry in the file and a restart. A bad `cron` only disables that source, and an error from one source does not stop the others.

Manual crawl: `POST api:3000/sources/:id/run` (the dashboard button) or `npm run crawl -- --source <id>` (in the container: `node dist/cli.js --source <id>`).
Run status goes to `crawl_runs` (`ok`, `partial` when `/analyze` failed for any document, `failed`) and to the api as `crawl:status`.

## Configuration (env)

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | – | Postgres connection string (required). |
| `VALKEY_URL`, `AI_URL`, `API_URL` | compose hosts | Service addresses. |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | see `.env.example` | Object storage. |
| `INTERNAL_TOKEN` | empty | Sent as `X-Internal-Token` to ai. Must match ai when `AI_REQUIRE_TOKEN=true`. |
| `ANALYZE_CONCURRENCY` | 1 | Parallel `/analyze` calls. Keep 1 for a single local LLM. |
| `AI_ANALYZE_TIMEOUT_MS` | 600000 | Per-document `/analyze` budget. |
| `AI_RETRY_DELAY_MS` | 30000 | Delay before the single retry after HTTP 502. |
| `PROXY_LIST` | empty | Comma-separated `http(s)://` or `socks5://` proxies. Empty = direct. |
| `SOURCES_FILE` | `sources.yaml` | Source definition file. |
| `CRAWL_ON_START` | true | Queue non-cron sources at startup. |

User-Agent is picked at random per item from 23 real browser strings. Max 2 parallel requests per host with a 1–3 s jitter.

## Safety

- Requests to internal addresses (loopback, private ranges, link-local, CGNAT) are blocked, also after redirects (see `src/adapters/ssrf.ts`). Known limit: a DNS rebinding window.
- Page content is stored as data and never used as an instruction. Details: [SECURITY.md](SECURITY.md).

## Known limits

- Social media block bots. A blocked source ends with a readable error in `crawl_runs`, and the demo runs on `sample`.
- Pending `/analyze` calls live in memory: after a collector restart those documents stay `fetched` and are analysed again on the next crawl.
- No live-proxy test was done (no proxy available).

## Checks

```bash
npm run typecheck && npm run lint
npx tsx --test "src/**/*.test.ts"
npm audit --audit-level=high
```
