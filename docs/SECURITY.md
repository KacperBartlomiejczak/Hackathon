# Bezpieczeństwo i audyt zależności — InvestWatch

Ostatnia aktualizacja: 2026-11-21

## 1. Architektura bezpieczeństwa stosu

- **Izolacja kontenerów w sieci Docker:** wszystkie usługi (`postgres`, `valkey`, `seaweedfs`, `ollama`, `collector`, `api`, `ai`, `web`) działają w dedykowanej sieci bridge Docker Compose; na zewnątrz wystawione są wyłącznie wymagane porty (`5173`, `3000`, `8000`, `5432`, `6379`, `8333`, `11434`), a komunikacja wewnętrzna (`api`, `ai`, `collector`) odbywa się po nazwach usług w sieci wewnętrznej. Kontenery aplikacyjne `api` (`USER node`) oraz `ai` (`USER app`) działają jako użytkownicy bez uprawnień roota.
- **Brak twardo zakodowanych sekretów w repozytorium:** zmienne wrażliwe trafiają do kontenerów wyłącznie przez `env_file: [.env]`, plik `.env` jest wykluczony w `.gitignore`, a `.githooks/pre-commit` blokuje przypadkowe zacommitowanie sekretów. W `.env.example` umieszczono wyłącznie lokalne wartości dev/demo do czystego startu — przed produkcją należy je zastąpić wygenerowanymi sekretami.
- **Walidacja konfiguracji Zod przy starcie:** `api/src/config.ts` (oraz `collector/src/config.ts`) waliduje wszystkie zmienne środowiskowe schematem `zod` zanim aplikacja przyjmie ruch (m.in. `INTERNAL_TOKEN` min. 16 znaków, poprawność URL dla `DATABASE_URL`, `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `WEB_ORIGIN`, niepuste `S3_ACCESS_KEY` i `S3_SECRET_KEY`).
- **Uwierzytelnianie ruchu wewnętrznego i CORS:** endpointy `POST /internal/alerts` i `POST /internal/crawl-status` w `api/` wymagają nagłówka `X-Internal-Token` porównywanego przez `timingSafeEqual` na skrótach SHA-256; logger `pino` maskuje (`redact`) nagłówki i pola wrażliwe. CORS w `api/` i Socket.io ograniczony jest do `WEB_ORIGIN`.
- **Lokalne przetwarzanie LLM (on-premise):** cała inferencja LLM (`SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M`) i embeddingi (`bge-m3`) działają lokalnie w kontenerze `ollama` — żadne treści dokumentów ani zapytania nie są wysyłane do zewnętrznych API. W promptach (`ai/prompts/m2-risk-info/system.md`) treść stron jest izolowana w znacznikach `<document>...</document>` jako nieufne dane (ochrona przed prompt injection).
- **Przypięte wersje i czyste licencje:** obrazy Dockera mają przypięte dokładne tagi (zero `latest`), `ai/pyproject.toml` stosuje `exclude-newer`, a komponenty dobrano pod kątem przekazania praw UKNF (Valkey BSD-3-Clause, SeaweedFS Apache-2.0, `asyncpg` Apache-2.0 zamiast `psycopg` LGPL-3.0).

## 2. Zbiorcze raporty bezpieczeństwa serwisów (`<serwis>/SECURITY.md`)

> Sekcja do uzupełnienia końcowymi wynikami skanów od właścicieli serwisów przed oddaniem.

| Serwis | Narzędzie i źródło | Wynik | Uwagi / braki |
|---|---|---|---|
| `ai/` | `uvx pip-audit==2.10.1` na `uv.lock` (`ai/SECURITY.md`) | **0 znanych podatności** (`No known vulnerabilities found`) | `exclude-newer = "2026-11-07T00:00:00Z"` |
| `web/` | `npm audit --audit-level=high` oraz `npm audit` (`web/SECURITY.md` na `team/web`) | **0 podatności** (`found 0 vulnerabilities`) | brak sekretów w kodzie i `web/Dockerfile` |
| `api/` | `npm audit` odnotowany w `docs/ai-log/api.md` | **0 podatności** wg logu | do dodania plik `api/SECURITY.md` od właściciela |
| `collector/` | przegląd `package.json` + `package-lock.json` | 3 paczki runtime (`pino`, `yaml`, `zod`, MIT/ISC) | do dodania plik `collector/SECURITY.md` z wynikiem `npm audit` |
