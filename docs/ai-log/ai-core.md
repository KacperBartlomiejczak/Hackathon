# AI log — ai-core

## 2026-11-21 — szkielet ai/
- Zlecono: init `ai/` (uv, Python 3.12, FastAPI, Pydantic v2 wg `docs/contracts.md`, logging, ruff z zakazem `print`, Dockerfile), `GET /health` sprawdzający Ollamę.
- Skille: `dependency-guard` (licencje z PyPI, OSV = 0 CVE, wersje `==` i `exclude-newer` −2 tyg., `pip-audit` czysty), `risk-classifier` (układ `prompts/`, `rules/`).
- Zweryfikowano: `uv run pytest` (2 testy z mockiem Ollamy), `/health` na żywo → `ollama: ok`, 3 modele.
- Do weryfikacji przez człowieka: `docker build ai/` (lokalnie brak Dockera), licencja Bielika w `ai/DEPENDENCIES.md`.
