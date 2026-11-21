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
