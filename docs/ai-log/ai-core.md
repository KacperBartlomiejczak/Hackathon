# AI log — team/ai-core

## 2026-11-21 — ai/ skeleton
- **Task:** scaffold `ai/` (uv, deps, `models.py`, `main.py` with `/health` + stubs, `config.yaml`, Dockerfile).
- **Skills:** `dependency-guard` (license/CVE check of every package and transitive deps), `risk-classifier` (risk levels, no invented scores on stubs). No `fastapi` skill exists in the repo.
- **Human decisions/corrections:**
  - `psycopg` is LGPL-3.0 → replaced by `asyncpg` (Apache-2.0) after approval.
  - `/eval` kept as GET per `docs/contracts.md` (request said POST).
  - `M1Candidate` and `EvalResult` are not in contracts yet → marked TODO for team/api (`data-contract`).
- **Bug caught by test:** `Literal[1,2,3]` as a query param did not coerce `"2"` → 422; switched to `int` with `ge=1, le=3`.
- **Not verified:** Docker build (daemon not running), live Ollama (remote), live Postgres (schema from #4 pending).
