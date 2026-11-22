# Bezpieczeństwo i audyt zależności — InvestWatch

Ostatnia aktualizacja: 2026-11-22

## 1. Architektura bezpieczeństwa stosu

- **Izolacja kontenerów w sieci Docker:** wszystkie usługi (`postgres`, `valkey`, `seaweedfs`, `ollama`, `collector`, `api`, `ai`, `web`) działają w dedykowanej sieci bridge Docker Compose; komunikacja wewnętrzna (`api`, `ai`, `collector`) odbywa się po nazwach usług w sieci wewnętrznej. Kontenery aplikacyjne `api` (`USER node`), `collector` (`USER pwuser`) oraz `ai` (`USER app`) działają jako użytkownicy bez uprawnień roota.
- **Brak twardo zakodowanych sekretów w repozytorium:** zmienne wrażliwe trafiają do kontenerów wyłącznie przez `env_file: [.env]`, plik `.env` jest wykluczony w `.gitignore`, a `.githooks/pre-commit` blokuje przypadkowe zacommitowanie sekretów. W `.env.example` umieszczono wyłącznie lokalne wartości dev/demo do czystego startu — przed produkcją należy je zastąpić wygenerowanymi sekretami.
- **Walidacja konfiguracji Zod przy starcie:** `api/src/config.ts` (oraz `collector/src/config.ts`) waliduje wszystkie zmienne środowiskowe schematem `zod` zanim aplikacja przyjmie ruch (m.in. `INTERNAL_TOKEN` min. 16 znaków, poprawność URL dla `DATABASE_URL`, `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `WEB_ORIGIN`, niepuste `S3_ACCESS_KEY` i `S3_SECRET_KEY`).
- **Uwierzytelnianie ruchu wewnętrznego i CORS:** endpointy `POST /internal/alerts` i `POST /internal/crawl-status` w `api/` wymagają nagłówka `X-Internal-Token` porównywanego przez `timingSafeEqual` na skrótach SHA-256; logger `pino` maskuje (`redact`) nagłówki i pola wrażliwe. CORS w `api/` i Socket.io ograniczony jest do `WEB_ORIGIN`.
- **Lokalne przetwarzanie LLM (on-premise):** cała inferencja LLM (`SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M`) i embeddingi (`bge-m3`) działają lokalnie w kontenerze `ollama` — żadne treści dokumentów ani zapytania nie są wysyłane do zewnętrznych API. W promptach (`ai/prompts/*/system.md`) treść stron jest izolowana w znacznikach `<document>...</document>` jako nieufne dane (ochrona przed prompt injection).
- **Przypięte wersje i czyste licencje:** obrazy Dockera mają przypięte dokładne tagi (zero `latest`), `ai/pyproject.toml` stosuje `exclude-newer`, a komponenty dobrano pod kątem przekazania praw UKNF (Valkey BSD-3-Clause, SeaweedFS Apache-2.0, `asyncpg` Apache-2.0 zamiast `psycopg` LGPL-3.0).

## 2. Audyt paczek aplikacji (`npm` / `pip-audit` / `osv-scanner`)

| Serwis | Narzędzie i źródło | Wynik | Uwagi / braki |
|---|---|---|---|
| `ai/` | `uvx pip-audit==2.10.1` na `uv.lock` (`ai/SECURITY.md`) + OSV (55 paczek wg Issue #44) | **0 znanych podatności** (`No known vulnerabilities found`) | `exclude-newer = "2026-11-07T00:00:00Z"` |
| `web/` | `npm audit --audit-level=high` oraz `npm audit` (`web/SECURITY.md`) | **0 podatności** (`found 0 vulnerabilities`) | brak sekretów w kodzie i `web/Dockerfile` |
| `api/` | `npm audit --audit-level=high` (`api/SECURITY.md`, 129 prod + 122 dev) | **0 podatności** (`found 0 vulnerabilities`) | dodatkowo `npm audit --omit=dev` = 0 |
| `collector/` | `npm audit --audit-level=high` (Issue #44, `docs/ai-log/lead-collector.md`) | **0 podatności** | do dodania plik `collector/SECURITY.md` od właściciela |

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

Skan wykonany 2026-11-21 narzędziem **`docker scout` `v1.28.0`** (`trivy` i `osv-scanner` nie były zainstalowane na hoście). Obrazy `web` po podbiciu (Issue #44) skanowano Trivy 0.76.2, bo Scout wymaga konta Docker.

| Obraz | Serwis | Digest | Podatności (C / H / M / L / ?) | Health score / Status | Uwagi / zalecenia |
|---|---|---|---|---|---|
| `pgvector/pgvector:0.8.7-pg16` | `postgres` | `484e838076e0` | `4C / 139H` (Trivy 0.76.2, 2026-11-22) | — | najnowszy patch linii pg16 (0.8.7, 2026-11-12); fixable `26`, wszystkie w pakietach Debian Bookworm. Zostaje na PG16 i bookworm, zob. sekcja 4 |
| `valkey/valkey:8.1.12-alpine` | `valkey` | `9971099af41c` | `0C / 0H` (Trivy, 2026-11-22) | — | tag bez zmian, ale obraz przebudowany 2026-11-19 na Alpine 3.24 (poprzedni skan Scout: `1C / 5H`) |
| `chrislusf/seaweedfs:4.52` | `seaweedfs` | `57877e32bb90` | `0C / 1H` (Trivy, 2026-11-22) | — | podbite z `3.96` (Trivy: `6C / 80H`, Alpine 3.22; Scout: `23C / 92H`). Baza Alpine 3.24; dane z wolumenu 3.96 odczytują się po podbiciu, `-s3.config` działa tak samo (Issue #73) |
| `curlimages/curl:8.23.0` | `s3-init`, `ollama-init` | `3fb7e13e5d17` | `0C / 32H` (Trivy, 2026-11-22) | — | najnowszy 8.x; kontener jednorazowy (`restart: "no"`), bez ekspozycji sieciowej |
| `ollama/ollama:0.40.17` | `ollama` | lokalny | niekompletny (`238` paczek) | brak pełnej oceny | `401 Unauthorized` na API obrazu bazowego (brak `docker login` w Scout CLI) |
| `node:22.23.5-bookworm-slim` | `api`, `collector` (build) | `47725aca53d3` | `0C / 17H / 24M / 42L` | `D (39%)` | `0` Critical; `api` działa jako `USER node` |
| `mcr.microsoft.com/playwright:v1.65.1-noble` | `collector` (runtime) | `766137e2d9ca` | `0C / 7H / 220M / 30L` | `D (50%)` | `0` Critical; działa jako `USER pwuser` |
| `python:3.12.16-slim-trixie` | `ai` | — | `0C / 51H` (Trivy, ai-core, Issue #73) | — | podbite z `3.12.12-slim-bookworm` (Scout: `8C / 58H`); pozostałe `51H` bez poprawki w Debianie (`ai/SECURITY.md`); działa jako `USER app` |
| `node:22.23.5-alpine` | `web` (build) | — | `0C / 10H` (Trivy) | — | podbite z `node:22.12-alpine` (Scout: `10C / 75H`). Wszystkie `10H` w paczkach dołączonych do `npm`; etap build nie trafia do obrazu końcowego (`web/SECURITY.md`) |
| `nginx:1.30.7-alpine` | `web` (runtime) | — | `0C / 0H` (Trivy, po `apk upgrade libxml2`) | — | podbite z `nginx:1.27.5-alpine` (Scout: `18C / 68H`); ostatnia `HIGH` (`libxml2 2.13.9-r2`) usunięta w `web/Dockerfile` (Issue #44) |

### Komendy do powtórzenia skanu obrazów

```bash
# Docker Scout (dla obrazów linuksowych z poziomu Windows wymagana flaga --platform)
docker scout quickview --platform linux/amd64 <obraz:tag>

# Alternatywnie w CI / na maszynie z Trivy:
trivy image --severity HIGH,CRITICAL <obraz:tag>
# albo bez instalacji (tak skanowano obrazy web, Trivy 0.76.2):
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.76.2 image --severity CRITICAL,HIGH --scanners vuln <obraz:tag>
```

## 4. Znane ograniczenia (środowisko demo)

- `postgres` (5432), `valkey` (6379), `seaweedfs` (8333), `ollama` (11434) i `ai` (8000) są mapowane wyłącznie na `127.0.0.1` hosta (Issue #72, #70), więc nie są widoczne z sieci Wi-Fi. Z zewnątrz dostępne są tylko `web` (5173) i `api` (3000). Port `8333` zostaje na localhost, bo przeglądarka pobiera screenshoty z presigned URL (`S3_PUBLIC_ENDPOINT`).
- `web` (nginx) nie dostaje `env_file`: zmienne potrzebne przy budowie (`VITE_API_URL`, `VITE_ADMIN_TOKEN`) idą przez `build.args`, a w kontenerze nie ma żadnych sekretów z `.env`.
- `seaweedfs` działa z `-s3.config` (`infra/seaweedfs/entrypoint.sh` generuje tożsamość z `S3_ACCESS_KEY` / `S3_SECRET_KEY`): żądania bez podpisu SigV4 dostają 403. Healthcheck używa `/healthz`, a `s3-init` podpisuje wywołania (`curl --aws-sigv4`). Domyślne klucze z `.env.example` są kluczami dev/demo i przed wdrożeniem trzeba je zmienić.
- `ADMIN_TOKEN` (zapisy REST w `api`) jest opcjonalny: pusty oznacza zapis bez tokenu. Token wbudowany w bundle dashboardu (`VITE_ADMIN_TOKEN`) jest publiczny z definicji, więc chroni przed przypadkowymi zapisami, a nie przed użytkownikiem dashboardu.
- `AI_REQUIRE_TOKEN` w serwisie `ai` zostaje domyślnie wyłączony do czasu, aż `collector` i `api` zaczną wysyłać `X-Internal-Token` (Issue #70).
- **Obrazy z pozostałymi podatnościami (Issue #73, skan Trivy 0.76.2 z 2026-11-22):**
  - `pgvector/pgvector:0.8.7-pg16` (`4C / 139H`): to najnowszy patch linii pg16, a krytyczne luki leżą w pakietach Debian Bookworm. Wariant `-trixie` zmienia glibc (2.36 → 2.41), co na istniejącym wolumenie `pg_data` grozi niezgodnością kolejności indeksów tekstowych (m.in. unikalny indeks `url_hash`), a przejście na PG17 psuje wolumen. Ryzyko zaakceptowane: port `5432` tylko na `127.0.0.1`, baza dostępna wyłącznie z hosta i z sieci Compose. Na świeżym wolumenie można rozważyć wariant `-trixie`.
  - `curlimages/curl:8.23.0` (`0C / 32H`): najnowszy 8.x, kontener jednorazowy bez portów.
  - `chrislusf/seaweedfs:4.52` (`0C / 1H`): zostaje, port `8333` tylko na `127.0.0.1`, S3 wymaga podpisu.
