# Bezpieczeństwo i audyt zależności — InvestWatch

Ostatnia aktualizacja: 2026-11-22

## 1. Architektura bezpieczeństwa stosu

- **Izolacja kontenerów w sieci Docker i bindowanie portów (#72):** wszystkie usługi (`postgres`, `valkey`, `seaweedfs`, `ollama`, `collector`, `api`, `ai`, `web`) działają w dedykowanej sieci bridge Docker Compose; komunikacja wewnętrzna (`api`, `ai`, `collector`) odbywa się po nazwach usług w sieci wewnętrznej. Usługi pomocnicze i backendowe (`postgres`, `valkey`, `seaweedfs`, `ollama`, `ai`) mają porty hosta zbindowane wyłącznie do `127.0.0.1` (brak ekspozycji na interfejsy LAN/Wi-Fi), `collector` nie publikuje żadnych portów, a na zewnątrz wystawione pozostają jedynie `web` (`5173`) i `api` (`3000`). Kontenery aplikacyjne `api` (`USER node`), `collector` (`USER pwuser`) oraz `ai` (`USER app`, `uid=10001`) działają jako użytkownicy bez uprawnień roota.
- **Brak twardo zakodowanych sekretów w repozytorium i izolacja `.env` w `web` (#72):** zmienne wrażliwe trafiają wyłącznie do kontenerów backendowych i infrastrukturalnych przez `env_file: [.env]`; kontener `web` nie montuje `env_file: [.env]` i nie otrzymuje sekretów z `.env` (`docker-compose.yml` przekazuje mu wyłącznie publiczny argument budowania `VITE_API_URL`, a opcjonalny `ARG VITE_ADMIN_TOKEN=` w `web/Dockerfile` ma domyślnie pustą wartość). Plik `.env` jest wykluczony w `.gitignore`, a `.githooks/pre-commit` blokuje przypadkowe zacommitowanie sekretów. W `.env.example` umieszczono wyłącznie lokalne wartości dev/demo do czystego startu — przed produkcją należy je zastąpić wygenerowanymi sekretami.
- **Walidacja konfiguracji Zod przy starcie:** `api/src/config.ts` (oraz `collector/src/config.ts`) waliduje wszystkie zmienne środowiskowe schematem `zod` zanim aplikacja przyjmie ruch (m.in. `INTERNAL_TOKEN` min. 16 znaków, poprawność URL dla `DATABASE_URL`, `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `WEB_ORIGIN`, niepuste `S3_ACCESS_KEY` i `S3_SECRET_KEY`).
- **Uwierzytelnianie ruchu wewnętrznego, zapisów, rate limit, CSV i CORS:**
  - Endpointy `POST /internal/alerts` i `POST /internal/crawl-status` w `api/` wymagają nagłówka `X-Internal-Token` porównywanego przez `timingSafeEqual` na skrótach SHA-256; logger `pino` maskuje (`redact`) nagłówki (`authorization`, `x-internal-token`, `cookie`, `set-cookie`) i pola wrażliwe.
  - Opcjonalna ochrona zapisów w `api/` (`ADMIN_TOKEN` min. 16 znaków w `api/src/auth.ts`, #71 / PR #80): gdy ustawiony, żądania `PUT`/`PATCH`/`POST` poza `/internal/*` wymagają `Authorization: Bearer <token>` (porównanie `timingSafeEqual` na SHA-256 w `preHandler` po rate limicie).
  - Opcjonalna ochrona endpointów `ai/` (`AI_REQUIRE_TOKEN`, w `ai/app/auth.py`): weryfikacja `X-Internal-Token` w czasie stałym (`hmac.compare_digest`) z trybem fail-closed (`503`, gdy włączone przy pustym `INTERNAL_TOKEN`). Proxy `GET /eval` w `api/src/routes/settings.ts` przekazuje ten nagłówek do `ai/` (#70, PR #80).
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

## 3. Skan obrazów Dockera (`docker scout quickview` / Trivy)

Skan bazowy wykonany 2026-11-21 narzędziem **`docker scout` `v1.28.0`** (`trivy` i `osv-scanner` nie były zainstalowane na hoście). Obrazy `web` po podbiciu (Issue #44, Trivy 0.76.2) oraz obraz `ai` po podbiciu w PR #76 (Issue #73, `aquasec/trivy`) skanowano Trivy.

| Obraz | Serwis | Digest | Podatności (C / H / M / L / ?) | Health score / Status | Uwagi / zalecenia |
|---|---|---|---|---|---|
| `pgvector/pgvector:0.8.7-pg16` | `postgres` | `018b4a92e634` | `4C / 50H / 52M / 68L / 6?` | `D (50%)` | fixable `4C 30H` (Debian Bookworm) |
| `valkey/valkey:8.1.12-alpine` | `valkey` | `bba7a8ff03d3` | `1C / 5H / 1M / 0L` | `D (50%)` | fixable `1C 5H` (Alpine 3) |
| `chrislusf/seaweedfs:3.96` | `seaweedfs` | `3ce80bed9e8a` | `23C / 92H / 71M / 10L / 1?` | `E (17%)` | `1C` high-profile, baza wykryta jako `alpine:latest`; monitorować nowsze wydanie |
| `curlimages/curl:8.23.0` | `s3-init`, `ollama-init` | `3fb7e13e5d17` | `1C / 12H / 9M / 0L / 6?` | `C (56%)` | kontener jednorazowy init (`restart: "no"`), bez ekspozycji sieciowej |
| `ollama/ollama:0.40.17` | `ollama` | lokalny | niekompletny (`238` paczek) | brak pełnej oceny | `401 Unauthorized` na API obrazu bazowego (brak `docker login` w Scout CLI) |
| `node:22.23.5-bookworm-slim` | `api`, `collector` (build) | `47725aca53d3` | `0C / 17H / 24M / 42L` | `D (39%)` | `0` Critical; `api` działa jako `USER node` |
| `mcr.microsoft.com/playwright:v1.65.1-noble` | `collector` (runtime) | `766137e2d9ca` | `0C / 7H / 220M / 30L` | `D (50%)` | `0` Critical; działa jako `USER pwuser` |
| `python:3.12.16-slim-trixie` | `ai` | — | `0C / 51H` (Trivy) | — | podbite z `python:3.12.12-slim-bookworm` (Scout: `8C / 58H`, Trivy: `9C / 133H`) w PR #76 (Issue #73); `--ignore-unfixed` → `0`, wszystkie 51H bez poprawki upstream w Debianie; działa jako `USER app` (`uid=10001`, `ai/SECURITY.md`) |
| `node:22.23.5-alpine` | `web` (build) | — | `0C / 10H` (Trivy) | — | podbite z `node:22.12-alpine` (Scout: `10C / 75H`). Wszystkie `10H` w paczkach dołączonych do `npm`; etap build nie trafia do obrazu końcowego (`web/SECURITY.md`) |
| `nginx:1.30.7-alpine` | `web` (runtime) | — | `0C / 0H` (Trivy, po `apk upgrade libxml2`) | — | podbite z `nginx:1.27.5-alpine` (Scout: `18C / 68H`); ostatnia `HIGH` (`libxml2 2.13.9-r2`) usunięta w `web/Dockerfile` (Issue #44) |

### Ryzyko zaakceptowane (obrazy infrastrukturalne, stan po feature freeze)

Audyt dostępnych tagów na Docker Hub (2026-11-22) dla 4 pozostałych obrazów infrastrukturalnych:

- `valkey/valkey:8.1.12-alpine` (`1C / 5H`): najnowsze wydanie w gałęzi 8.x (`8.1.12-alpine3.24` ma ten sam digest); port zbindowany do `127.0.0.1` (#72), brak ekspozycji sieciowej.
- `curlimages/curl:8.23.0` (`1C / 12H`): najnowsze wydanie upstream (`latest` = `8.23.0`); kontener jednorazowy init (`restart: "no"`), bez portów.
- `pgvector/pgvector:0.8.7-pg16` (`4C / 50H`): dostępne upstream `0.8.7-pg16-trixie` (2026-11-12), odłożone po feature freeze, aby uniknąć nieprzetestowanej podmiany bazy DB bez działającego Demona Dockera; port zbindowany do `127.0.0.1` (#72), ruch wyłącznie w wewnętrznej sieci bridge.
- `chrislusf/seaweedfs:3.96` (`23C / 92H`): dostępne upstream `4.54` (skok major 3.x → 4.x), odłożone po feature freeze, aby nie ryzykować regresji API S3/presigned URL bez testu live; port zbindowany do `127.0.0.1` (#72), ruch wyłącznie w wewnętrznej sieci bridge.

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

- **Porty na `127.0.0.1` i brak `.env` w `web` (Issue #72):** `postgres`, `valkey`, `seaweedfs`, `ollama` i `ai` mają porty hosta zbindowane wyłącznie do `127.0.0.1` (nie są wystawione na interfejsach LAN/Wi-Fi hosta), a `web` nie montuje już `env_file: [.env]` ani nie otrzymuje sekretów środowiskowych. Porty loopback pozostają otwarte lokalnie na maszynie demo dla wygody debugowania, skryptów ewaluacyjnych i `S3_PUBLIC_ENDPOINT=http://localhost:8333` — na produkcji należy całkowicie usunąć publikację portów usług pomocniczych i wystawiać wyłącznie `web` i `api`.
- **SeaweedFS bez `-s3.config` (Issue #15):** `seaweedfs` działa w trybie demo `-s3` bez pliku `-s3.config` (bez wymuszania podpisów S3 na porcie `8333`, więc po zbindowaniu do `127.0.0.1` każdy proces lokalny na hoście może odczytać bucket bez podpisu) — w produkcji należy włączyć konfigurację kluczy S3.
- **`AI_REQUIRE_TOKEN=0` w domyślnej konfiguracji demo (Issue #70):** autoryzacja `X-Internal-Token` w `ai/` (`ai/app/auth.py`) oraz przekazywanie tokena z `api/` na `GET /eval` (`api/src/routes/settings.ts`, PR #80) są już zaimplementowane, natomiast `collector/src/ai/client.ts` nie dołącza jeszcze tego nagłówka do wywołań `/analyze` (oczekuje na `collector` w Issue #70). Po dopięciu nagłówka w `collector/` należy włączyć `AI_REQUIRE_TOKEN=1`.
- **Opcjonalny `ADMIN_TOKEN` i Socket.io (Issues #71, PR #80/#82):** zapisy (`PUT`/`PATCH`/`POST` w `api/`) są domyślnie otwarte, aby demo startowało z samego `.env.example`. Po ustawieniu `ADMIN_TOKEN` / `VITE_ADMIN_TOKEN` token trafia do publicznego bundla JS w `web/` (ochrona przed zapisami z zewnątrz panelu, nie przed użytkownikiem dashboardu). Kanał Socket.io wysyła zdarzenia tylko w jedną stronę i jest ograniczony przez CORS (`WEB_ORIGIN`). W produkcji wymagane są pełne logowanie i sesje.
- **Okno DNS rebinding w SSRF guardzie (`collector/`):** `isBlockedUrl` (`collector/src/adapters/ssrf.ts`) sprawdza DNS przed żądaniem Chromium (świadomy kompromis hackathonowy; w produkcji należy przypinać IP przez proxy).
