# Bezpieczeństwo i audyt zależności — InvestWatch

Ostatnia aktualizacja: 2026-11-22

## 1. Architektura bezpieczeństwa stosu

- **Izolacja kontenerów w sieci Docker i bindowanie portów (#72):** wszystkie usługi (`postgres`, `valkey`, `seaweedfs`, `ollama`, `collector`, `api`, `ai`, `web`) działają w dedykowanej sieci bridge Docker Compose; komunikacja wewnętrzna (`api`, `ai`, `collector`) odbywa się po nazwach usług w sieci wewnętrznej. Usługi pomocnicze i backendowe (`postgres`, `valkey`, `seaweedfs`, `ollama`, `ai`) mają porty hosta zbindowane wyłącznie do `127.0.0.1` (brak ekspozycji na interfejsy LAN/Wi-Fi), `collector` nie publikuje żadnych portów, a na zewnątrz wystawione pozostają jedynie `web` (`5173`) i `api` (`3000`). Kontenery aplikacyjne `api` (`USER node`), `collector` (`USER pwuser`) oraz `ai` (`USER app`, `uid=10001`) działają jako użytkownicy bez uprawnień roota.
- **Brak twardo zakodowanych sekretów w repozytorium i izolacja `.env` w `web` (#72):** zmienne wrażliwe trafiają wyłącznie do kontenerów backendowych i infrastrukturalnych przez `env_file: [.env]`; kontener `web` nie montuje `env_file: [.env]` i nie otrzymuje sekretów z `.env` (`docker-compose.yml` przekazuje mu wyłącznie publiczny argument budowania `VITE_API_URL`, a opcjonalny `ARG VITE_ADMIN_TOKEN=` w `web/Dockerfile` ma domyślnie pustą wartość). Plik `.env` jest wykluczony w `.gitignore`, a `.githooks/pre-commit` blokuje przypadkowe zacommitowanie sekretów. W `.env.example` umieszczono wyłącznie lokalne wartości dev/demo do czystego startu — przed produkcją należy je zastąpić wygenerowanymi sekretami.
- **Walidacja konfiguracji Zod przy starcie:** `api/src/config.ts` (oraz `collector/src/config.ts`) waliduje wszystkie zmienne środowiskowe schematem `zod` zanim aplikacja przyjmie ruch (m.in. `INTERNAL_TOKEN` min. 16 znaków, poprawność URL dla `DATABASE_URL`, `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `WEB_ORIGIN`, niepuste `S3_ACCESS_KEY` i `S3_SECRET_KEY`).
- **Uwierzytelnianie ruchu wewnętrznego, zapisów, rate limit, CSV i CORS:**
  - Endpointy `POST /internal/alerts` i `POST /internal/crawl-status` w `api/` wymagają nagłówka `X-Internal-Token` porównywanego przez `timingSafeEqual` na skrótach SHA-256; logger `pino` maskuje (`redact`) nagłówki (`authorization`, `x-internal-token`, `cookie`, `set-cookie`) i pola wrażliwe.
  - Opcjonalna ochrona zapisów w `api/` (`ADMIN_TOKEN` min. 16 znaków w `api/src/auth.ts`, #71 / PR #80): gdy ustawiony, żądania `PUT`/`PATCH`/`POST` poza `/internal/*` wymagają `Authorization: Bearer <token>` (porównanie `timingSafeEqual` na SHA-256 w `preHandler` po rate limicie).
  - Ochrona endpointów `ai/` (`AI_REQUIRE_TOKEN=true` domyślnie w `.env.example`, `ai/app/auth.py`): weryfikacja `X-Internal-Token` w czasie stałym (`hmac.compare_digest`) z trybem fail-closed (`503`, gdy włączone przy pustym `INTERNAL_TOKEN`). Nagłówek wysyłają zarówno proxy `GET /eval` w `api/src/routes/settings.ts` (PR #80), jak i `collector/src/ai/client.ts` (PR #105, #70).
  - Rate limit w `api/`: `300 żądań/min` na IP globalnie oraz `10 żądań/min` na `GET /export`; CORS w `api/` i Socket.io ograniczony jest wyłącznie do `WEB_ORIGIN`.
  - Eksport CSV w `api/` (zdejmowanie wiodącego `@` w kolumnach z handlem) i `web/` (pominięcie zwykłych `@handle` bez nawiasów i operatorów) neutralizuje formula injection (komórki zaczynające się od `=`, `+`, `-`, `@`, TAB lub CR dostają prefiks `'`).
- **Ochrona przed SSRF w `collector/` (#74):** adapter `web` w `collector/src/adapters/ssrf.ts` (`isBlockedUrl`) akceptuje wyłącznie `http:`/`https:`, sprawdza rozwiązane adresy DNS przez `net.BlockList` i blokuje za pomocą `context.route('**/*')` żądania (w tym przekierowania) kierowane do pętli zwrotnej, sieci prywatnych, link-local, CGNAT, IPv6 ULA oraz mapowanych IPv4 (`::ffff:...`), zarówno dla `startUrl`, jak i pobieranych stron.
- **Lokalne przetwarzanie LLM (on-premise) i ochrona przed prompt injection:** cała inferencja LLM (`SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M`) i embeddingi (`bge-m3`) działają lokalnie w kontenerze `ollama` — żadne treści dokumentów ani zapytania nie są wysyłane do zewnętrznych API. W promptach (`ai/prompts/*/system.md`) treść stron jest izolowana w znacznikach `<document>...</document>` jako nieufne dane, a funkcja `neutralize_delimiters` (`ai/app/llm.py`) usuwa próby zamknięcia znacznika; weryfikację zapewnia `ai/tests/test_prompt_injection.py` (12 testów offline + 3/3 live na Bieliku 11B: M1 0.941, M2 1.000, M3 0.956).
- **Przypięte wersje i czyste licencje:** obrazy Dockera mają przypięte dokładne tagi (zero `latest`), `ai/pyproject.toml` stosuje `exclude-newer`, a komponenty dobrano pod kątem przekazania praw UKNF (Valkey BSD-3-Clause, SeaweedFS Apache-2.0, `asyncpg` Apache-2.0 zamiast `psycopg` LGPL-3.0).

## 2. Audyt paczek aplikacji (`npm` / `pip-audit` / `osv-scanner`)

| Serwis | Narzędzie i źródło | Wynik | Uwagi / braki |
|---|---|---|---|
| `ai/` | `uvx pip-audit==2.10.1` (47 paczek runtime, 50 z dev w `ai/SECURITY.md`), ponowny `uvx pip-audit@2.10.0 --disable-pip --no-deps` po PR #67 oraz OSV (55 paczek wg Issue #44) | **0 znanych podatności** (`No known vulnerabilities found`) | `exclude-newer = "2026-11-07T00:00:00Z"`; tranzytywne `tld` używane jako MPL-1.1 |
| `web/` | `npm audit --audit-level=high` oraz `npm audit` (`web/SECURITY.md`, ponownie po dodaniu `vitest@5.1.0` w PR #82) | **0 podatności** (`found 0 vulnerabilities`) | brak sekretów w kodzie i `web/Dockerfile` (opcjonalny `ARG VITE_ADMIN_TOKEN`) |
| `api/` | `npm audit --audit-level=high` (`api/SECURITY.md`, 129 prod + 122 dev, ponownie po PR #80) | **0 podatności** (`found 0 vulnerabilities`) | dodatkowo `npm audit --omit=dev` = 0 |
| `collector/` | `npm audit --audit-level=high` (`collector/SECURITY.md`, 208 pakietów w lockfile; Issue #44) | **0 podatności** | powtórzone 2026-11-22: `found 0 vulnerabilities` (także `--omit=dev`); szczegóły i zabezpieczenia w `collector/SECURITY.md` |

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

## 3. Skan obrazów Dockera (`docker scout quickview` / Trivy)

Skan bazowy wykonany 2026-11-21 narzędziem **`docker scout` `v1.28.0`** (`trivy` i `osv-scanner` nie były zainstalowane na hoście). Obrazy `web` po podbiciu (Issue #44, Trivy 0.76.2) oraz obraz `ai` po podbiciu w PR #76 (Issue #73, `aquasec/trivy`) skanowano Trivy.

| Obraz | Serwis | Digest | Podatności (C / H / M / L / ?) | Health score / Status | Uwagi / zalecenia |
|---|---|---|---|---|---|
| `pgvector/pgvector:0.8.7-pg16` | `postgres` | `484e838076e0` | `4C / 139H` (Trivy 0.76.2, 2026-11-22) | — | najnowszy patch linii pg16 (0.8.7, 2026-11-12); fixable `26`, wszystkie w pakietach Debian Bookworm. Zostaje na PG16 i bookworm, zob. sekcja 4 |
| `valkey/valkey:8.1.12-alpine` | `valkey` | `9971099af41c` | `0C / 0H` (Trivy, 2026-11-22) | — | tag bez zmian, ale obraz przebudowany 2026-11-19 na Alpine 3.24 (poprzedni skan Scout: `1C / 5H`) |
| `chrislusf/seaweedfs:4.52` | `seaweedfs` | `57877e32bb90` | `0C / 1H` (Trivy, 2026-11-22) | — | podbite z `3.96` (Trivy: `6C / 80H`, Alpine 3.22; Scout: `23C / 92H`). Baza Alpine 3.24; dane z wolumenu 3.96 odczytują się po podbiciu, `-s3.config` działa tak samo (Issue #73) |
| `curlimages/curl:8.23.0` | `s3-init`, `ollama-init` | `3fb7e13e5d17` | `0C / 32H` (Trivy, 2026-11-22) | — | najnowszy 8.x; kontener jednorazowy (`restart: "no"`), bez ekspozycji sieciowej |
| `ollama/ollama:0.40.17` | `ollama` | lokalny | niekompletny (`238` paczek) | brak pełnej oceny | `401 Unauthorized` na API obrazu bazowego (brak `docker login` w Scout CLI) |
| `node:22.23.5-bookworm-slim` | `api`, `collector` (build) | `47725aca53d3` | `0C / 17H / 24M / 42L` | `D (39%)` | `0` Critical; `api` działa jako `USER node` |
| `mcr.microsoft.com/playwright:v1.65.1-noble` | `collector` (runtime) | `766137e2d9ca` | `0C / 7H / 220M / 30L` | `D (50%)` | `0` Critical; działa jako `USER pwuser` |
| `python:3.12.16-slim-trixie` | `ai` | — | `0C / 51H` (Trivy) | — | podbite z `python:3.12.12-slim-bookworm` (Scout: `8C / 58H`, Trivy: `9C / 133H`) w PR #76 (Issue #73); `--ignore-unfixed` → `0`, wszystkie `51H` bez poprawki upstream w Debianie; działa jako `USER app` (`uid=10001`, `ai/SECURITY.md`) |
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

- **Porty na `127.0.0.1` i brak `.env` w `web` (Issue #72):** `postgres` (`5432`), `valkey` (`6379`), `seaweedfs` (`8333`), `ollama` (`11434`) i `ai` (`8000`) są mapowane wyłącznie na `127.0.0.1` hosta, więc nie są widoczne z sieci Wi-Fi/LAN. Z zewnątrz dostępne są tylko `web` (`5173`) i `api` (`3000`). Port `8333` zostaje na localhost, bo przeglądarka pobiera screenshoty z presigned URL (`S3_PUBLIC_ENDPOINT`). `web` (nginx) nie dostaje `env_file`: zmienne potrzebne przy budowie (`VITE_API_URL`, `VITE_ADMIN_TOKEN`) idą przez `build.args`, a w kontenerze nie ma sekretów z `.env`.
- **Uwierzytelniany S3 SeaweedFS (`-s3.config`, Issue #72):** `seaweedfs` działa z `-s3.config` (`infra/seaweedfs/entrypoint.sh` generuje tożsamość z `S3_ACCESS_KEY` / `S3_SECRET_KEY`): żądania bez podpisu SigV4 dostają `403`, healthcheck używa `/healthz`, a `s3-init` podpisuje wywołania (`curl --aws-sigv4`). Domyślne klucze z `.env.example` są kluczami dev/demo i przed wdrożeniem produkcyjnym trzeba je zmienić.
- **`AI_REQUIRE_TOKEN=true` włączone domyślnie (Issue #70):** autoryzacja `X-Internal-Token` w `ai/` (`ai/app/auth.py`) chroni `/analyze`, `/analyze-text`, `/reanalyze` i `/eval`; wymagany nagłówek wysyłają zarówno `api/src/routes/settings.ts` (PR #80), jak i `collector/src/ai/client.ts` (PR #105). W razie lokalnego wywołania endpointów `ai/` bez tokena należy dołączyć `X-Internal-Token` z `.env`.
- **Opcjonalny `ADMIN_TOKEN` i Socket.io (Issue #71, PR #80/#82):** zapisy (`PUT`/`PATCH`/`POST` w `api/`) są domyślnie otwarte, aby demo startowało z samego `.env.example`. Po ustawieniu `ADMIN_TOKEN` / `VITE_ADMIN_TOKEN` token trafia do publicznego bundla JS w `web/` (ochrona przed przypadkowymi zapisami z zewnątrz panelu, nie przed użytkownikiem dashboardu). Kanał Socket.io wysyła zdarzenia tylko w jedną stronę i jest ograniczony przez CORS (`WEB_ORIGIN`).
- **Okno DNS rebinding w SSRF guardzie (`collector/`):** `isBlockedUrl` (`collector/src/adapters/ssrf.ts`) sprawdza DNS przed żądaniem Chromium (świadomy kompromis hackathonowy; w produkcji należy przypinać IP przez proxy).
- **Obrazy z pozostałymi podatnościami — ryzyko zaakceptowane (Issue #73, skan Trivy 0.76.2 z 2026-11-22):**
  - `pgvector/pgvector:0.8.7-pg16` (`4C / 139H`): to najnowszy patch linii `pg16`, a krytyczne luki leżą w pakietach Debian Bookworm. Wariant `-trixie` zmienia glibc (`2.36 → 2.41`), co na istniejącym wolumenie `pg_data` grozi niezgodnością kolejności indeksów tekstowych (m.in. unikalny indeks `url_hash`), a przejście na PG17 psuje wolumen. Ryzyko zaakceptowane: port `5432` tylko na `127.0.0.1`, baza dostępna wyłącznie z hosta i z sieci Compose (na świeżym wolumenie można rozważyć `-trixie`).
  - `curlimages/curl:8.23.0` (`0C / 32H`): najnowszy `8.x`, kontener jednorazowy (`restart: "no"`) bez portów.
  - `chrislusf/seaweedfs:4.52` (`0C / 1H`): podbity z `3.96` (`6C / 80H` → `0C / 1H`), port `8333` tylko na `127.0.0.1`, S3 wymaga podpisu SigV4.
