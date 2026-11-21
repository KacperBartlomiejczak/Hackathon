# Bezpieczeństwo i audyt zależności — InvestWatch

Ostatnia aktualizacja: 2026-11-21

## 1. Architektura bezpieczeństwa stosu

- **Izolacja kontenerów w sieci Docker:** wszystkie usługi (`postgres`, `valkey`, `seaweedfs`, `ollama`, `collector`, `api`, `ai`, `web`) działają w dedykowanej sieci bridge Docker Compose; na zewnątrz wystawione są wyłącznie wymagane porty (`5173`, `3000`, `8000`, `5432`, `6379`, `8333`, `11434`), a komunikacja wewnętrzna (`api`, `ai`, `collector`) odbywa się po nazwach usług w sieci wewnętrznej. Kontenery aplikacyjne `api` (`USER node`), `collector` (`USER pwuser`) oraz `ai` (`USER app`) działają jako użytkownicy bez uprawnień roota.
- **Brak twardo zakodowanych sekretów w repozytorium:** zmienne wrażliwe trafiają do kontenerów wyłącznie przez `env_file: [.env]`, plik `.env` jest wykluczony w `.gitignore`, a `.githooks/pre-commit` blokuje przypadkowe zacommitowanie sekretów. W `.env.example` umieszczono wyłącznie lokalne wartości dev/demo do czystego startu — przed produkcją należy je zastąpić wygenerowanymi sekretami.
- **Walidacja konfiguracji Zod przy starcie:** `api/src/config.ts` (oraz `collector/src/config.ts`) waliduje wszystkie zmienne środowiskowe schematem `zod` zanim aplikacja przyjmie ruch (m.in. `INTERNAL_TOKEN` min. 16 znaków, poprawność URL dla `DATABASE_URL`, `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `WEB_ORIGIN`, niepuste `S3_ACCESS_KEY` i `S3_SECRET_KEY`).
- **Uwierzytelnianie ruchu wewnętrznego i CORS:** endpointy `POST /internal/alerts` i `POST /internal/crawl-status` w `api/` wymagają nagłówka `X-Internal-Token` porównywanego przez `timingSafeEqual` na skrótach SHA-256; logger `pino` maskuje (`redact`) nagłówki i pola wrażliwe. CORS w `api/` i Socket.io ograniczony jest do `WEB_ORIGIN`.
- **Lokalne przetwarzanie LLM (on-premise):** cała inferencja LLM (`SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M`) i embeddingi (`bge-m3`) działają lokalnie w kontenerze `ollama` — żadne treści dokumentów ani zapytania nie są wysyłane do zewnętrznych API. W promptach (`ai/prompts/m2-risk-info/system.md`) treść stron jest izolowana w znacznikach `<document>...</document>` jako nieufne dane (ochrona przed prompt injection).
- **Przypięte wersje i czyste licencje:** obrazy Dockera mają przypięte dokładne tagi (zero `latest`), `ai/pyproject.toml` stosuje `exclude-newer`, a komponenty dobrano pod kątem przekazania praw UKNF (Valkey BSD-3-Clause, SeaweedFS Apache-2.0, `asyncpg` Apache-2.0 zamiast `psycopg` LGPL-3.0).

## 2. Audyt paczek aplikacji (`npm` / `pip-audit` / `osv-scanner`)

| Serwis | Narzędzie i źródło | Wynik | Uwagi / braki |
|---|---|---|---|
| `ai/` | `uvx pip-audit==2.10.1` na `uv.lock` (`ai/SECURITY.md`) + OSV (55 paczek wg Issue #44) | **0 znanych podatności** (`No known vulnerabilities found`) | `exclude-newer = "2026-11-07T00:00:00Z"` |
| `web/` | `npm audit --audit-level=high` oraz `npm audit` (`web/SECURITY.md`) | **0 podatności** (`found 0 vulnerabilities`) | brak sekretów w kodzie i `web/Dockerfile` |
| `api/` | `npm audit` odnotowany w `docs/ai-log/api.md` i Issue #44 | **0 podatności** | do dodania plik `api/SECURITY.md` od właściciela |
| `collector/` | `npm audit` odnotowany w Issue #44 i `docs/ai-log/lead-collector.md` | **0 podatności** | do dodania plik `collector/SECURITY.md` od właściciela |

### Komendy do powtórzenia audytu paczek

```bash
# Serwisy Node (w collector/, api/, web/)
npm audit --audit-level=high

# Serwis Python (ai/) — pip-audit oraz osv-scanner
uv export --no-dev --no-hashes > ai/requirements.txt
uvx pip-audit==2.10.1 -r ai/requirements.txt --disable-pip --no-deps
# alternatywnie z zainstalowanego pip-audit / osv-scanner:
pip-audit -r ai/requirements.txt
osv-scanner --lockfile=ai/uv.lock
```

## 3. Skan obrazów Dockera (`docker scout quickview`)

Skan wykonany 2026-11-21 narzędziem **`docker scout` `v1.28.0`** (`trivy` i `osv-scanner` nie były zainstalowane na hoście).

| Obraz | Serwis | Digest | Podatności (C / H / M / L / ?) | Health score / Status | Uwagi / zalecenia |
|---|---|---|---|---|---|
| `pgvector/pgvector:0.8.7-pg16` | `postgres` | `018b4a92e634` | `4C / 50H / 52M / 68L / 6?` | `D (50%)` | fixable `4C 30H` (Debian Bookworm) |
| `valkey/valkey:8.1.12-alpine` | `valkey` | `bba7a8ff03d3` | `1C / 5H / 1M / 0L` | `D (50%)` | fixable `1C 5H` (Alpine 3) |
| `chrislusf/seaweedfs:3.96` | `seaweedfs` | `3ce80bed9e8a` | `23C / 92H / 71M / 10L / 1?` | `E (17%)` | `1C` high-profile, baza wykryta jako `alpine:latest`; monitorować nowsze wydanie |
| `curlimages/curl:8.23.0` | `s3-init`, `ollama-init` | `3fb7e13e5d17` | `1C / 12H / 9M / 0L / 6?` | `C (56%)` | kontener jednorazowy init (`restart: "no"`), bez ekspozycji sieciowej |
| `ollama/ollama:0.40.17` | `ollama` | lokalny | niekompletny (`238` paczek) | brak pełnej oceny | `401 Unauthorized` na API obrazu bazowego (brak `docker login` w Scout CLI) |
| `node:22.23.5-bookworm-slim` | `api`, `collector` (build) | `47725aca53d3` | `0C / 17H / 24M / 42L` | `D (39%)` | `0` Critical; `api` działa jako `USER node` |
| `mcr.microsoft.com/playwright:v1.65.1-noble` | `collector` (runtime) | `766137e2d9ca` | `0C / 7H / 220M / 30L` | `D (50%)` | `0` Critical; działa jako `USER pwuser` |
| `python:3.12.12-slim-bookworm` | `ai` | `2986c55feb36` | `8C / 58H / 57M / 61L / 6?` | `D (39%)` | działa jako `USER app` |
| `node:22.12-alpine` | `web` (build) | `513c40ed37f6` | `10C / 75H / 59M / 21L / 1?` | `D (39%)` | **przestarzały obraz bazowy** — zgłoszono do `team/web` podbicie np. do `node:22.23.5-alpine` |
| `nginx:1.27.5-alpine` | `web` (runtime) | `62223d644fa2` | `18C / 68H / 78M / 25L / 3?` | `E (17%)` | **`1C 1H` high-profile, przestarzały obraz bazowy** — zgłoszono do `team/web` podbicie do aktualnego przypiętego patcha (np. `nginx:1.30.7-alpine`) |

### Komendy do powtórzenia skanu obrazów

```bash
# Docker Scout (dla obrazów linuksowych z poziomu Windows wymagana flaga --platform)
docker scout quickview --platform linux/amd64 <obraz:tag>

# Alternatywnie w CI / na maszynie z Trivy:
trivy image --severity HIGH,CRITICAL <obraz:tag>
```
