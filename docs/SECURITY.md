# Bezpieczeństwo i audyt zależności — InvestWatch

Ostatnia aktualizacja: 2026-11-21

## 1. Status skanów zależności

| Serwis | Narzędzie i źródło | Wynik | Uwagi / braki |
|---|---|---|---|
| `ai/` | `uvx pip-audit==2.10.1` na `uv.lock` (`ai/SECURITY.md`) | **0 znanych podatności** (`No known vulnerabilities found`) | `exclude-newer = "2026-11-07T00:00:00Z"`, `asyncpg` (Apache-2.0) zamiast `psycopg` (LGPL-3.0) |
| `web/` | `npm audit --audit-level=high` oraz `npm audit` (`web/SECURITY.md` na `team/web`) | **0 podatności** (`found 0 vulnerabilities`) | brak sekretów w kodzie i `web/Dockerfile` |
| `api/` | `npm audit` odnotowany w `docs/ai-log/api.md` | **0 podatności** wg logu | brakuje jeszcze pliku `api/SECURITY.md` do scalenia |
| `collector/` | przegląd manifestu `package.json` + `package-lock.json` | 3 paczki runtime (`pino`, `yaml`, `zod`, MIT/ISC) | brakuje jeszcze pliku `collector/SECURITY.md` z wynikiem `npm audit` |

## 2. Higiena sekretów i konfiguracji

- Sekrety przekazywane są wyłącznie przez `.env` (`env_file: [.env]` w `docker-compose.yml`), plik `.env` znajduje się w `.gitignore`.
- W `.env.example` zapisano wyłącznie lokalne wartości dev/demo (przed wdrożeniem produkcyjnym należy zmienić `POSTGRES_PASSWORD`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `INTERNAL_TOKEN`).
- Endpointy wewnętrzne `POST /internal/alerts` i `POST /internal/crawl-status` w `api/` wymagają nagłówka `X-Internal-Token` weryfikowanego przez `timingSafeEqual` na skrótach SHA-256; `pino` maskuje (`redact`) nagłówki i pola wrażliwe.
- CORS w `api/` i Socket.io ograniczony jest do `WEB_ORIGIN`.

## 3. Odporność AI i licencje

- W promptach LLM (`ai/prompts/m2-risk-info/system.md`) treść scrapowanych stron izolowana jest znacznikami `<document>...</document>` jako nieufne dane (ochrona przed prompt injection).
- Infrastruktura i paczki używają wyłącznie permisywnych licencji: PostgreSQL + pgvector, Valkey (BSD-3-Clause), SeaweedFS (Apache-2.0), Ollama (MIT), `SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M` (Apache-2.0), `bge-m3` (MIT).
- Wszystkie obrazy Dockera mają przypięte wersje (brak `latest`).
