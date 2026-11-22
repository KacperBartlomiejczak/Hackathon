# AI log — branch team/web

## Align web with api GET /findings, /findings/:id and alert:new
- Asked Claude to: compare `origin/team/api` (routes, `docs/contracts.md`) with `web/src/types` and `lib/api.ts`, then adapt web.
- Changes: `FindingListItem` and `AlertPayload` types; `pageSize` sent to the API and read back for pagination; `statusHistory` and top-level `screenshotUrl` mapped to the detail model; alert toast built from the flat `alert:new` payload.
- Human to verify: run against the real api once `docker compose up` serves data (`VITE_USE_MOCKS=false`). Stats, eval, settings, sources, export and PATCH status do not exist in the api yet.

## Per-endpoint mock/API switch
- Asked Claude to: replace the single `USE_MOCKS` flag with a per-endpoint switch so finished api endpoints run live and missing ones stay mocked.
- Changes: `isMocked(endpoint)` in `lib/api.ts`, configured by `VITE_MOCKED_ENDPOINTS` (default: trend, summary, status, eval, settings, sources, export; `VITE_USE_MOCKS=true|false` still forces all/none); `DemoBadge` ("Dane demonstracyjne") on screens that still use mocks.
- Human to verify: with `VITE_MOCKED_ENDPOINTS=` (empty) every screen hits the real api; as #4 ships an endpoint, remove its name from the list.

## Live stats and status endpoints (from team/api)
- Asked Claude to: read `origin/team/api` contract for `PATCH /findings/:id/status`, `/stats/trend`, `/stats/summary` and adapt web.
- Changes: summary lists mapped to the `StatsSummary` records; trend points (day x module) summed per day; PATCH sends `changedBy`; `StatusSelect` offers only transitions the api accepts (new→in_review→confirmed|dismissed); `status`, `trend`, `summary` removed from the default mocked list.
- Human to verify: after `team/api` is merged and the stack runs, status change, trend chart and tiles against real data.

## Error and loading states
- Asked Claude to: replace ad-hoc "Ladowanie..." / error paragraphs with one component and make failures show up quickly.
- Changes: `QueryState` (loading, error with "Spr�buj ponownie" retry) on findings, details, trends, calibration and sources; `QueryClient` retry 1 with 500 ms delay, no refetch on window focus.
- Human to verify: with the api stopped the error appears after about 1 s and retry works once the api is back; in mock mode the console stays clean.

## Institutional restyle
- Asked Claude to: restyle the dashboard for a government-agency look (reference: knf.gov.pl), with mockups reviewed before any code; skill `anti-ui-slop` installed globally (not in repo).
- Changes: theme tokens in `index.css` (navy header, lighter blue actions, grey page/card backgrounds, red only for alerts), sans-serif font with tabular numbers, new header/nav/footer in `Layout`, existing slate/white classes remapped to tokens, chart colours.
- Human to verify: contrast and readability on the projector, all four screens in mock mode, console clean with the api running.

## Api error handling and trend gaps (issues #14, #21)
- Asked Claude to: handle the api error codes from the issues and fill empty days on the trend chart.
- Changes: `lib/apiError.ts` (`ApiError`, Polish messages for 409 invalid_transition, 501, 502 ai_unavailable, 503 queue_unavailable, 404); used in status change, `/eval` and "Uruchom crawl"; `fetchTrend` fills missing days with zeros.
- Human to verify: with the real api, status change to a disallowed state, calibration while ai is down, crawl while the queue is down. Checked here only against a local stub (501, 503, trend gap).

## Real api switch and bundle slimming (issues #21, #29, #30)
- Asked Claude to: stop mocking `/eval`, `/settings`, `/sources` (now on main), fix CSV formula injection, show the export-truncated notice, code-split pages and slim the web image.
- Changes: `DEFAULT_MOCKED` is now only `export`; CSV fields starting with `= + - @ tab CR` get an apostrophe prefix, `;` separator and decimal comma; `X-Export-Truncated` shows a Polish notice; pages are `React.lazy` (main chunk 850 kB -> 346 kB, Recharts only in the trends chunk); Dockerfile serves `dist` from `nginx:1.27.5-alpine` with an SPA fallback.
- Human to verify: `docker build web` and the page on port 5173, calibration slider against the real api, a CSV with a `=1+1` quote opened in Excel, export once `GET /export` lands on main (remove `export` from `VITE_MOCKED_ENDPOINTS`).

## Export on the real api (issue #29)
- Asked Claude to: switch export from the mock to `GET /export` (landed on main in #39) and add the JSON response type.
- Changes: `DEFAULT_MOCKED` is empty (mocks only with `VITE_USE_MOCKS=true`); `ExportJson` type in `types/index.ts`; the api already exposes `Content-Disposition` and `X-Export-Truncated` through CORS.
- Human to verify: with the full stack up, download CSV and JSON with a module filter and without, open the CSV in Excel, check the truncation notice. Here only checked against a local stub (query string, truncation notice).

## Calibration save fix (found while testing the full stack)
- Asked Claude to: test every dashboard flow against the running stack and fix what breaks.
- Changes: "Zapisz próg" sent only `{ threshold }`, but `PUT /settings/modules/:n` is a full replace and returns 400 without `weights`; the save now sends the weights from the fetched settings. Found with a real api, mocks hid it.
- Human to verify: save a threshold per module and confirm `GET /settings/modules/:n` returns it; hard-reload the page first, index.html has no cache headers and a stale bundle still sends the old body.

## Review against the task and polish (calibration, details, search)
- Asked Claude to: review all of web/ against docs/team/5-web.md and docs/contracts.md, then fix the gaps it found. No new skill used.
- Changes: calibration shows "Oznaczone flagą" (tp + fp from /eval) on the real api instead of a mock-only tile; unique React keys in ReasonsCard; 300 ms debounce on the search box (api rate limit); Polish labels for criteria, verdicts and source kinds (`lib/utils.ts`, unknown codes fall back to the raw value); `finding:updated` also refreshes summary and trend.
- Human to verify: browser console clean on all screens, slider changes FP/FN and the flag count, fast typing in "Szukaj" sends one request, criteria labels match real ai output.

## Base image bump in web/Dockerfile (CVE)
- Asked Claude to: bump node and nginx base images in web/Dockerfile after the Docker Scout report, rebuild, check healthcheck and SPA routing, scan the new images and document the result. Skill: dependency-guard (images).
- Changes: node 22.12-alpine -> 22.23.5-alpine (same Node as api and collector), nginx 1.27.5-alpine -> 1.30.7-alpine (stable branch, pinned). Scan with Trivy 0.76.2 because Docker Scout needs an account: CRITICAL/HIGH node 4/55 -> 0/10 (npm bundled deps, build stage only), nginx 3/67 -> 0/1 (libxml2 Alpine package). Results in web/SECURITY.md.
- Human to verify: docker compose ps shows web healthy, browser console clean on the new image, someone with a Docker account repeats the scan with Docker Scout.

## Optional admin token for write requests (issue #71)
- Asked Claude to: handle the write-endpoint auth from issue #71 on the web side only. No new skill.
- Changes: `lib/api.ts` adds `Authorization: Bearer` from optional `VITE_ADMIN_TOKEN` to PUT /settings, PATCH /findings/:id/status and POST /sources/:id/run (`writeInit`); `lib/apiError.ts` maps 401/403 to a Polish "Brak uprawnień do zapisu" message; limits documented in `web/SECURITY.md` (token is public in the bundle).
- Human to verify: with no token nothing changes; once team/api enforces `ADMIN_TOKEN` and team/infra passes `VITE_ADMIN_TOKEN` as a build arg, saving a threshold works and a wrong token shows the toast.

## libxml2 upgrade in the nginx runtime image (Issue #44), done from team/api
- Asked Claude to: check open web issues and fix them (pat-dem, full access, rules from docs/team/5-web.md). Skill: dependency-guard (images).
- Changes: `RUN apk upgrade --no-cache libxml2` in the runtime stage of web/Dockerfile (2.13.9-r2 -> 2.13.9-r3, CVE-2026-86144); result in web/SECURITY.md. Trivy 0.76.2 on the final image: CRITICAL 0, HIGH 0. `/`, `/findings`, `/calibration` return 200.
- Not done: #51 (remove facebook/instagram/tiktok from the source filter) waits for the lead's decision on social adapters.
- Human to verify: docker compose ps shows web healthy, browser console clean.

## Clean browser console: favicon and form field names
- Asked Claude to: review the dashboard in the browser (mock mode) for console errors and Issues, then fix them. No new skill.
- Changes: `web/public/favicon.svg` + `<link rel="icon">` (removes the favicon.ico 404); `name` attribute on all filter inputs/selects, `ModuleSelect` and `StatusSelect` (removes the "form field has neither id nor name" Issue).
- Human checked: console on the findings list in Chrome with DevTools. Still to check by hand: Trendy, Kalibracja, Źródła, finding details, loading/empty states, projector view.

## Docker build arg for admin token, vitest smoke tests (issues #71, #75)
- Asked Claude to: pass `VITE_ADMIN_TOKEN` into the web Docker build and add `npm test` to web. Skill: dependency-guard (vitest).
- Changes: `ARG`/`ENV VITE_ADMIN_TOKEN` (no default) in `web/Dockerfile`; threshold save error now uses `apiErrorMessage` (401 hint); `vitest@5.1.0` (MIT, accepts vite 8; 5.1.1 skipped, only 4 days old) with 8 tests for `exportFormat` and `apiError`; `web/SECURITY.md` and `web/DEPENDENCIES.md` updated. `npm run build`, `npm test` (8/8) and `npm audit` (0) pass.
- Human checked (Docker, 2026-11-22): image built with `--build-arg VITE_ADMIN_TOKEN=<test-token>` contains the token in `/usr/share/nginx/html/assets/api-*.js`, image built without the arg does not. Stack up, all services healthy. Calibration: UI values match `/eval`; M1 changes with the slider, M2/M3 barely (api reports `missingFindings` 36-38 of 40 gold docs, so only 2-4 have findings: ai-data). Console 0 warnings on Findingi, details (with screenshot from S3, no 403), Trendy, Kalibracja, Źródła, empty list state; only errors seen were 500s from `/findings` before applying `infra/db/004_seen_tracking.sql` to the old local DB volume (existing volumes do not re-run init scripts).
- Still to check: loading state and 1280 px on a projector; calibration screenshot for the pitch should use a low M1 threshold (default 0.6 shows zeros).

## Unit tests with edge cases for web/src/lib
- Asked Claude to: add tests including edge cases. No new skill, no new dependencies (existing vitest).
- Changes: `utils.test.ts`, `api.test.ts` (mock mode, real mode with stubbed `fetch`, admin token, export, trend gap filling), extended `apiError.test.ts` and `exportFormat.test.ts`. 94 tests; `npm test` and `npm run build` pass.
- Found 4 real bugs, kept as `it.fails` with `KNOWN BUG` comments (remove the marker when fixing): negative page returns items from the end; plain-object lookups resolve `constructor` (labels, `apiErrorMessage`); CSV formula guard prefixes legitimate `@handle` advertiser names with `'`.
- Human to decide: fix the 4 bugs (small changes in `web/src/lib`).

## Local-day date filters and trend (issue #88)
- Asked Claude to: implement #88 in web only. No new skill.
- Changes: `lib/dates.ts` (`toLocalDay`, local-day boundaries); `from`/`to` go to the api as local-day UTC timestamps (list and export); mock filter and trend group by local day; trend asks the api for `bucket=hour` and sums hours into local days. `lib/dates.test.ts` pins `Europe/Warsaw`. Build, `npm test` (also under another TZ) and audit pass.
- Human to verify: finding created 2026-11-20T23:30Z shows for from=to=21.11 and not for 20.11; trend counts it on 21.11.

## Fixes for the 4 bugs found by the edge-case tests
- Asked Claude to: fix them. Changes in `web/src/lib`: label and error-message lookups use `Object.hasOwn` (no more `constructor` resolving to a function); mock `fetchFindings` returns an empty page for page < 1; CSV formula guard skips plain `@handle` values (`@SUM(A1)` is still neutralised). `it.fails` markers removed; 99 tests pass.

## Verdict labels per module and manual check of #88
- Asked Claude to: fix the verdict wording from the review hand-off (M1/M3 `fail` means "detected", not "not met"). No new skill, no new dependencies.
- Changes: `verdictLabel(verdict, module?)` in `web/src/lib/utils.ts` uses "wykryto" / "nie wykryto" for M1 and M3, M2 keeps the checklist wording; `ReasonsCard` passes `finding.module`; test added. 100 tests and `tsc` pass.
- Human verified #88 on real data: findings 24-27 (21.11 23:xx UTC) show for from=to=22.11 and not for 21.11; list and trend agree (21.11 = 23, 22.11 = 16). Issue closed. A stale browser cache showed UTC counts until a hard refresh.

## Correction to the PR #96 note
- PR #96 changed only `web/` (verdict wording), so it does not change `/eval` results and no `/reanalyze` is needed because of it. The "re-run `/reanalyze?module=1`" line in its description was wrong.
- If `/reanalyze` is needed after M1 logic changes, it belongs to ai-core (endpoint) and ai-data (gold set, `/eval`), not web.
- Process fix: every PR gets `Closes #...` or an issue created first.

## #84: refresh findings after saving the threshold
- Asked Claude to: make the web part of #84. Changes: after "Zapisz próg" the `findings`, `summary`, `trend` and `finding` queries are invalidated, so list and tiles refetch.
- Not enough alone: `findings.risk_level` is stored by ai, and api does not call `ai /reanalyze` on `PUT /settings/modules/:module`. That part belongs to api (team/api).

## Browser verification (issue #121)
- Asked Claude to: check in the live browser (Docker stack, built-in browser) Socket.io toasts, calibration panel, status change, CSV export, trend chart and console. No new skill, no new dependencies, no code changes.
- Result: `alert:new` (test POST to `/internal/alerts` for existing finding 4) shows the toast with "Zobacz" opening the finding, and the nav badge counts it off `/findings`; title `null` and firm `null` render fine. Status change PATCH 200, history shows the transition. Calibration slider matches `/eval` for M1, M2, M3 (precision, recall, FP, FN, total); "Zapisz próg" PUT 200 and the stored value was restored to 0.60. CSV export 200 with `;` separator and BOM. Trend matches `/stats/summary`. Console: 0 errors and 0 warnings on Findingi, details, Trendy, Kalibracja, Źródła and the empty list state; list keys checked in code (prod image does not print React key warnings).
- Human to know: finding 4 stays `in_review` in the local DB (transition is one-way). M2/M3 barely react to the threshold because most gold docs have no finding (#89, ai-data). "analyze failed" on Źródła is #90. Metrics update 2-3 s after moving the slider with no loading hint (not changed).
