---
title: InvestWatch — HackNation 2026 (UKNF)
---

<!-- Slajd 1 -->
# InvestWatch
### Automatyczny monitoring treści inwestycyjnych w polskim internecie

**Zadanie UKNF · HackNation 2026 · 100% open-source i on-premise**

- **Problem:** szybki przyrost reklam inwestycyjnych w sieci i social mediach (finfluencerzy, brak lub ukrycie ostrzeżeń o ryzyku, nielegalne doradztwo poza rejestrem KNF).
- **Wyzwanie nadzoru:** ręczny przegląd setek stron i postów jest wolny, a materiały reklamowe znikają.
- **Rozwiązanie:** system wykrywający naruszenia w 3 modułach (M1/M2/M3) z gotowym dowodem: **dosłownym cytatem, oceną kryteriów i screenshotem z S3**.

---

<!-- Slajd 2 -->
## Architektura systemu (100% on-premise)

> Źródło diagramu: `presentation/architecture.mmd` (do eksportu jako PNG/SVG na slajd)

```mermaid
flowchart LR
  web["web (:5173)"] <-- "REST + Socket.io" --> api["api (:3000)"]
  api -- "BullMQ" --> valkey[("valkey (:6379)")]
  valkey --> collector["collector (Playwright)"]
  collector -- "HTML + PNG" --> s3[("seaweedfs S3 (:8333)")]
  collector --> pg[("postgres pgvector (:5432)")]
  collector -- "POST /analyze/{id}" --> ai["ai (:8000)"]
  ai <--> pg
  ai -- "HTML" --> s3
  ai -- "bge-m3 + Bielik 11B" --> ollama["ollama (:11434)"]
  ai -- "/internal/alerts" --> api
  api -- "presigned URL" --> s3
```

- **Stos:** Node 22 (TS strict: `collector`, `api`), Python 3.12 (`ai` FastAPI), React 19 + Vite (`web`), PostgreSQL 16 + `pgvector`, Valkey 8, SeaweedFS S3, Ollama.
- **Uruchomienie jedną komendą:** `cp .env.example .env && docker compose up --build` (wszystkie obrazy z przypiętymi wersjami).

---

<!-- Slajd 3 -->
## Moduł 1/3: `collector` i `api` — zbieranie danych i dystrybucja zdarzeń

- **`collector` (Node 22 + Playwright + BullMQ):**
  - Adapter `sample` (dane offline) i adapter `web` (wspólny Chromium, rotacja User-Agent i `PROXY_LIST`, limit 2 równoległe na hosta, jitter).
  - Zapisuje surowy HTML oraz screenshot PNG do SeaweedFS S3 i metadane do tabeli `documents` (`upsert` po `url_hash`).
  - Raportuje postęp (`running` / `ok` / `partial` / `failed`) przez `POST /internal/crawl-status` oraz wywołuje `POST /analyze/{document_id}`.
- **`api` (Fastify + Drizzle + Socket.io):**
  - REST API: `GET /findings` (filtry, paginacja), `GET /findings/:id` (cytaty + presigned `screenshotUrl` ważny 15 min), `PATCH /findings/:id/status` (`SELECT ... FOR UPDATE` + `finding_status_history`), `/stats/trend`, `/stats/summary`, `/settings/modules/:module`, `/eval`, `/sources`, `/export`.
  - Socket.io real-time: `alert:new`, `finding:updated`, `crawl:status`.

---

<!-- Slajd 4 -->
## Moduł 2/3: `ai` — pipeline i 3 moduły analityczne

- **Preprocessing i deduplikacja:** ekstrakcja tekstu (`trafilatura`), dokładna (SHA-256) i przybliżona (`simhash`, próg Hamminga 6) deduplikacja oraz embeddingi `bge-m3` (`vector(1024)`).
- **3 moduły klasyfikacji na lokalnym Bieliku (`SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M`):**
  1. **M1 (Finfluencerzy):** wzmianka o zarejestrowanej firmie z rejestru KNF (86 podmiotów w `entities.csv`) publikowana spoza jej `official_domains` / `social_handles`.
  2. **M2 (Informacja o ryzyku):** ocena materiałów firm inwestycyjnych wg 4-punktowej checklisty z `ai/prompts/m2-risk-info/system.md` (`risk_warning_present`, `risk_prominence`, `profit_risk_balance`, `no_guaranteed_returns`).
  3. **M3 (Shadow advisory):** wykrywanie nielicencjonowanego doradztwa i zarządzania portfelem (reguły + embeddingi `bge-m3` + LLM).

---

<!-- Slajd 5 -->
## Moduł 3/3: `web` — dashboard analityka UKNF

- **Widoki robocze (React 19 + Vite + Tailwind + Recharts):**
  - **Findingi:** tabela incydentów z filtrami (moduł, ryzyko, status, źródło, zakres dat, wyszukiwarka `q`) oraz paginacją.
  - **Szczegóły findingu:** pełna treść po czyszczeniu, lista `reasons[]` z **dosłownym cytatem** i werdyktem, podgląd screenshota z S3, zmiana statusu z historią.
  - **Trendy i raportowanie:** kafelki podsumowania (`/stats/summary`), wykres incydentów w czasie (`/stats/trend`), eksport CSV/JSON z ochroną przed formula injection (`=`, `+`, `-`, `@`).
  - **Alerty i źródła:** toasty `alert:new` na żywo przez Socket.io oraz przycisk **„Uruchom crawl”** na liście źródeł.
- **Lekki obraz produkcyjny:** code-splitting (`React.lazy`, główny chunk 346 kB) serwowany przez `nginx:1.27.5-alpine`.

---

<!-- Slajd 6 -->
## Kalibracja i wiarygodność wyników

- **Hybrydowy scoring:**
  `score = w_llm * llm + w_rules * rules + w_emb * emb` (domyślnie `0.60 / 0.25 / 0.15`, edytowalne w `module_settings`).
- **Zasada „bez cytatu nie ma flagi”:**
  - `CriterionResult.quote` jest wymagane w schemacie JSON (Pydantic `format`, `temperature: 0`).
  - Walidacja dopasowania cytatu do treści dokumentu (`rapidfuzz.partial_ratio >= 90`); przy awarii LLM API zwraca `502` i zapisuje `failed` — nigdy nie wymyśla wyniku.
- **Progi i panel kalibracji na żywo (`GET /eval` + `gold.csv`):**
  - `high >= 0.8` (alert Socket.io), `medium >= próg`, `low < próg`.
  - Suwak progu w dashboardzie na bieżąco przelicza **`precision`, `recall`, `TP`, `FP`, `FN`, `TN`** i pozwala zapisać próg przez `PUT /settings/modules/:module`.

---

<!-- Slajd 7 -->
## Bezpieczeństwo i czystość licencyjna

- **Izolacja sieci i kontenerów:** wszystkie usługi w jednej sieci bridge Docker Compose; kontenery `api` (`USER node`) i `ai` (`USER app`) działają bez uprawnień roota; przypięte wersje obrazów (zero `latest`).
- **Sekrety i walidacja startowa:** sekrety wyłącznie w `.env` (`.gitignore`), wstrzykiwane przez `env_file`; `api/src/config.ts` i `collector/src/config.ts` walidują zmienne przez `zod` przy starcie (`INTERNAL_TOKEN` >= 16 znaków).
- **Ochrona ruchu wewnętrznego i logów:** `/internal/*` chronione `X-Internal-Token` (`timingSafeEqual` na SHA-256), CORS ograniczony do `WEB_ORIGIN`, maskowanie pól wrażliwych (`redact`) w `pino`.
- **100% lokalne AI i odporność na prompt injection:** dane analizowane wyłącznie w lokalnej Ollamie, treść stron izolowana w `<document>...</document>`.
- **Czyste licencje i audyt:** Valkey (BSD-3), SeaweedFS (Apache-2.0), `asyncpg` (Apache-2.0); `pip-audit` (`ai/SECURITY.md`) i `npm audit` (`web/SECURITY.md`) = **0 znanych podatności**.

---

<!-- Slajd 8 -->
## Standaryzowany proces pracy z AI (20% oceny)

- **Kontrakt w `CLAUDE.md` + 5 skilli (`.claude/skills/`):** obowiązek *plan-first* (najpierw plan i akceptacja człowieka, potem kod), zakaz `console.log`/`print`, skille `scraper-adapter`, `risk-classifier`, `data-contract`, `dependency-guard`, `demo-check`.
- **Ochrona w Gicie (`.githooks/pre-commit`):** twardy podział katalogów na 6 branchy `team/*`, blokada commitów na `main` oraz automatyczna blokada sekretów w diffie.
- **Prawdziwe przykłady z `docs/ai-log/*.md`, gdzie proces i człowiek wyłapali błędy:**
  - `ai-core`: `dependency-guard` wykrył licencję LGPL-3.0 dla `psycopg` → zamieniono na `asyncpg` (Apache-2.0); test na Bieliku wykrył kopiowanie jednego cytatu → bump promptu do `m2-v2`.
  - `ai-data`: testy integracyjne na `pgvector` wykazały, że próg `simhash = 3` przepuszcza near-duplikaty → podniesiono do `6`.
  - `api`: testy na Postgresie złapały błąd `date_trunc` w `/stats/trend` oraz wymusiły `UNIQUE (document_id, module)` + rzutowanie signed `bigint` dla `simhash`.
  - `lead-collector` i `infra`: dodano brakujący `ioredis` dla `bullmq`, usunięto retry po 502/timeout w `postAnalyze`, poprawiono tag Bielika i wykrywanie błędów w `pull-models.sh`.

---

<!-- Slajd 9 -->
## Demo na żywo — kluczowy przepływ

1. **Start stosu:** `docker compose up --build` → czyste środowisko z gotowym buckietem S3, bazą `pgvector` i modelami w Ollamie.
2. **Wyzwolenie crawla:** ekran **Źródła** → **„Uruchom crawl”** → status `crawl:status` na żywo.
3. **Alert wysokiego ryzyka:** toast **`alert:new`** w przeglądarce bez odświeżania strony.
4. **Analiza dowodów:** wejście w szczegóły findingu → cytaty per kryterium + screenshot z SeaweedFS S3 + ocena modułów M1/M2/M3.
5. **Kalibracja i raport:** suwak progu zmienia `precision` / `recall` / `FP` / `FN`, zmiana statusu na `confirmed` i eksport CSV.

*(Pełny scenariusz z podziałem na sekundy: `presentation/DEMO_SCRIPT.md`.)*

---

<!-- Slajd 10 -->
## Dalszy rozwój i skalowanie

- **Rozbudowa rejestru KNF (`entities.csv`):** uzupełnienie pełnych `official_domains` i `social_handles` dla wszystkich podmiotów nadzorowanych (redukcja fałszywych alertów w M1).
- **Analiza treści wideo i grafik (OCR / ASR):** automatyczna transkrypcja rolek (TikTok, YouTube Shorts, Instagram Reels) oraz ekstrakcja drobnego druku ze zdjęć reklam.
- **Skalowanie i indeksy pełnotekstowe:** dodanie indeksów `pg_trgm` na `documents.title` / `text_clean` oraz rozproszonych workerów `collector` z pulą proxy.
- **Ciągłe strojenie jakości:** rozbudowa zbioru `gold.csv` przez analityków UKNF i okresowa re-ewaluacja wag oraz wersji promptów przez `/reanalyze`.
