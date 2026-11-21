# AI log — branch team/web

## Align web with api GET /findings, /findings/:id and alert:new
- Asked Claude to: compare `origin/team/api` (routes, `docs/contracts.md`) with `web/src/types` and `lib/api.ts`, then adapt web.
- Changes: `FindingListItem` and `AlertPayload` types; `pageSize` sent to the API and read back for pagination; `statusHistory` and top-level `screenshotUrl` mapped to the detail model; alert toast built from the flat `alert:new` payload.
- Human to verify: run against the real api once `docker compose up` serves data (`VITE_USE_MOCKS=false`). Stats, eval, settings, sources, export and PATCH status do not exist in the api yet.
