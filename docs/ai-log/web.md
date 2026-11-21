# AI log — branch team/web

## Align web with api GET /findings, /findings/:id and alert:new
- Asked Claude to: compare `origin/team/api` (routes, `docs/contracts.md`) with `web/src/types` and `lib/api.ts`, then adapt web.
- Changes: `FindingListItem` and `AlertPayload` types; `pageSize` sent to the API and read back for pagination; `statusHistory` and top-level `screenshotUrl` mapped to the detail model; alert toast built from the flat `alert:new` payload.
- Human to verify: run against the real api once `docker compose up` serves data (`VITE_USE_MOCKS=false`). Stats, eval, settings, sources, export and PATCH status do not exist in the api yet.

## Per-endpoint mock/API switch
- Asked Claude to: replace the single `USE_MOCKS` flag with a per-endpoint switch so finished api endpoints run live and missing ones stay mocked.
- Changes: `isMocked(endpoint)` in `lib/api.ts`, configured by `VITE_MOCKED_ENDPOINTS` (default: trend, summary, status, eval, settings, sources, export; `VITE_USE_MOCKS=true|false` still forces all/none); `DemoBadge` ("Dane demonstracyjne") on screens that still use mocks.
- Human to verify: with `VITE_MOCKED_ENDPOINTS=` (empty) every screen hits the real api; as #4 ships an endpoint, remove its name from the list.
