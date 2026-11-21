# Standaryzowany proces tworzenia oprogramowania z asystentami AI — InvestWatch

Dokument podsumowuje proces inżynierski zespołu (20% oceny jury UKNF, regulamin § 5 ust. 4 pkt 2) oraz zawiera scalony log wszystkich sesji z `docs/ai-log/*.md`.

---

## 1. Standard pracy zespołu z AI

1. **Jedno źródło kontekstu (`CLAUDE.md` + `docs/contracts.md`):**
   - `CLAUDE.md` definiuje architekturę, priorytety hackathonu (pionowe plastry end-to-end), zakaz `console.log`/`print`, obowiązek `strict: true` i `zod` w TypeScript oraz typowania Pydantic v2 i `ruff` (`T20`) w Pythonie.
   - `docs/contracts.md` stanowi jedyne źródło prawdy dla schematu PostgreSQL (`pgvector`), kolejek BullMQ, payloadów JSON i endpointów REST / Socket.io.
2. **Metodyka *Plan-First* (najpierw plan i akceptacja człowieka, potem kod):**
   - Przed każdą edycją plików, migracją lub dodaniem zależności agent ma obowiązek przeczytać pliki kontekstowe i przedstawić ustrukturyzowany `PLAN` (Cel, Pliki, Kroki, Nowe zależności, Wpływ na innych, Weryfikacja, Ryzyka).
   - Kod powstaje dopiero po wyraźnym zatwierdzeniu planu przez człowieka, a po wykonaniu przechodzi weryfikację testami i przegląd diffa.
3. **Izolacja odpowiedzialności i egzekwowanie w Gicie (`.githooks/pre-commit`):**
   - Zespół 6-osobowy pracuje na 6 stałych branchach (`team/lead-collector`, `team/ai-core`, `team/ai-data`, `team/api`, `team/web`, `team/infra`) bez bezpośrednich commitów na `main`.
   - Hook `.githooks/pre-commit` automatycznie blokuje commity na `main`, edycję plików należących do cudzego modułu oraz przypadkowe zacommitowanie sekretów (`(api_key|secret|password|token)=...`).
4. **Dedykowane skille domenowe (`.claude/skills/`):**
   - `scraper-adapter` — standard implementacji adapterów źródeł (`sample`, `web`, `youtube`), rotacji User-Agent/proxy i odporności na błędy.
   - `risk-classifier` — reguły modułów M1/M2/M3, separacja danych `<document>` od instrukcji systemowych (ochrona przed prompt injection), walidacja cytatów (`rapidfuzz`) i kalibracja `/eval`.
   - `data-contract` — procedura synchronicznej zmiany schematu SQL, `docs/contracts.md`, typów TS i modeli Pydantic.
   - `dependency-guard` — weryfikacja licencji (wykluczenie GPL/AGPL/LGPL oraz Redisa 7.4+ i MinIO na rzecz Valkey i SeaweedFS), zamrażanie wersji (`exclude-newer` w `uv`, dokładne piny w `npm`) i skany `npm audit` / `pip-audit` / `docker scout`.
   - `demo-check` — checklista czystego startu (`docker compose down -v && cp .env.example .env && docker compose up --build`) i ścieżki prezentacyjnej.

---

## 2. Kluczowe błędy wyłapane i naprawione dzięki weryfikacji człowiek + AI

- **Licencje łańcucha dostaw (`ai-core` + `dependency-guard`):** odrzucono proponowany sterownik `psycopg` / `psycopg_pool` z powodu licencji LGPL-3.0 na rzecz `asyncpg` (Apache-2.0).
- **Wiarygodność cytatów LLM (`ai-core` + `risk-classifier`):** testy na żywo z Bielikiem-11B wykazały, że model w wersji `m2-v1` kopiował ten sam cytat do wszystkich 4 kryteriów i zwracał stałe `confidence = 0.5`; w `m2-v2` wymuszono dedykowane pole `CriterionResult.quote` per kryterium oraz walidację `rapidfuzz.partial_ratio >= 90`.
- **Deduplikacja i typy 64-bitowe (`ai-data` + `api`):** testy integracyjne na `pgvector` pokazały, że próg `HAMMING_THRESHOLD=3` przepuszcza near-duplikaty z jednym zmienionym słowem (dystans 5–6) → podniesiono próg do `6`. Z kolei `api` wychwyciło niezgodność unsigned 64-bit `simhash` w Pythonie ze znakiem `bigint` w PostgreSQL (`bigint out of range`) i doprecyzowało rzutowanie w `docs/contracts.md`.
- **Błędy zapytań SQL i wyścigi (`api`):** testy `app.inject` na bazie PostgreSQL złapały błąd `date_trunc` w `/stats/trend` oraz kolizję nazwy kolumny `"id"` w podzapytaniu Drizzle dla `/sources` (`lastRun`), a przy zmianie statusu zastosowano blokadę wiersza `SELECT ... FOR UPDATE`.
- **Niezawodność infrastruktury i kolejki (`lead-collector` + `infra`):** wykryto brak opcjonalnego peera `ioredis` w `bullmq 6`, ciche połykanie błędów JSON z Ollamy przez `curl | tail` w `pull-models.sh`, problem z końcami linii `CRLF` w skryptach `.sh` na Windowsie (`.gitattributes`), kolizję bind-mountu `./infra/seed:/app/seed` z pakietem Pythona w `ai`, oraz brak `node` w obrazie `nginx:1.27.5-alpine` dla healthchecka `web` (przełączono na `wget`).

---

## 3. Scalony log prac z asystentem AI (wszystkie branche)

### 3.1. `team/lead-collector` — Kacper (`collector/`, integracja, harmonogram)

| Data / Etap | Zadanie zlecone AI | Użyte skille | Co zweryfikował / poprawił człowiek |
|---|---|---|---|
| 21.11 · Szkielet `collector/` | Init `collector/` (TS strict, `pino`, `zod`, `Dockerfile`, `sources.yaml`, typy adaptera). | `scraper-adapter`, `dependency-guard` | Przypięte wersje i licencje npm; zgodność `CollectedDocument` z `docs/contracts.md`. |
| 21.11 · Krok 6 + 9 (DB/S3/Playwright) | Paczki (`bullmq`, `playwright`, `drizzle-orm`, `pg`, `@aws-sdk/client-s3`, `p-limit`, `eslint`), schemat Drizzle, klient S3, ESLint `no-console`, `Dockerfile` na `mcr.microsoft.com/playwright:v1.65.1-noble`. | `dependency-guard` | Zaakceptowany plan przed kodowaniem; dopisany handler `pool.on('error')`, `tsc`, `eslint`, `docker build` OK (`npm audit` = 0). |
| 21.11 · Krok 10 (BullMQ) | Kolejki `crawl-source` i `crawl-item` (retry 3, backoff wykładniczy, concurrency 1/4) + graceful shutdown. | `dependency-guard` | Test na żywo z Valkey 8.1.12 wykazał brak `ioredis` (opcjonalny peer w BullMQ 6) → dodano `ioredis@5.11.1` (MIT, 0 CVE). |
| 21.11 · Kroki 12–14 (Adaptery + `/analyze`) | Adapter `sample` (HTML/JSON/JSONL), adapter `web` (wspólny Chromium, rotacja UA/proxy, limit 2/host, jitter, screenshot), klient `POST /analyze`, `pipeline.ts` (`upsert` po `url_hash`). | `scraper-adapter` | 5 testów `node:test`, test integracyjny na Postgres/Valkey/SeaweedFS (zapis HTML i PNG do S3, odporność na wyłączone `ai`). |
| 21.11 · `sources.yaml` + auto-crawl | Synchronizacja `sources.yaml` do tabeli `sources`, `CRAWL_ON_START`, wbudowanie `fixtures/sample` do obrazu. | — | Test w Docker Compose: 2 źródła, `crawl_run` OK, 5 dokumentów wysłanych na `/analyze`. |
| 21.11 · Fix `postAnalyze` | Przegląd PR-ów #11–#13; zmiana timeoutu `postAnalyze` z 60 s na 300 s i wyłączenie retry po `502`/timeout (zapobieganie wielokrotnemu liczeniu tego samego dokumentu przez LLM). | — | 7 testów `node:test` (brak retry przy 502 i timeout). |
| 21.11 · Issue #22 (`/internal/crawl-status`) | Ręczny crawl wyłączonych źródeł (`trigger !== 'schedule'`) oraz raportowanie `running` i `ok/partial/failed` na `POST /internal/crawl-status` z `X-Internal-Token`. | — | 9 testów `node:test` (weryfikacja nagłówka, payloadu i odporności na błędy sieci). |
| 21.11 · Kroki 16–17 (Fixtures demo + CLI) | `fixtures/sample/demo.jsonl` (11 rekordów: M1, M2, M3 i negatywy dla XTB, DM BOŚ, mBank, Noble) + CLI `npm run crawl -- --source <id>`. | `scraper-adapter` | Dry-run routingu 11/11 (poprawiono słowo kluczowe w fixture Noble pod regułę M2); test w Compose dał 16 przetworzonych dokumentów. |
| 21.11 · Issues #30, #29, #25, #8, #43 | Pomocnicze patche integracyjne (code-split i CSV escaping w `web`, weryfikacja manifestu Bielika w `registry.ollama.ai`, semafor `ANALYZE_CONCURRENCY=1` w `collector`). | `demo-check` | Testy współbieżności klienta AI (max 1 aktywna analiza naraz, brak resetu statusu `processed` przy re-crawlu). |
| 21.11 · Kroki 19, 20, 22, 25 (UA, Discovery, YouTube, Cron) | Lista 23 UA + walidacja `PROXY_LIST`, discovery linków z głębokości 1 (3 blogi finansowe), adapter YouTube RSS (Strefa Inwestorów, Inwestomat, XTB Polska), harmonogram `upsertJobScheduler` z `sources.cron` (`Europe/Warsaw`). | `scraper-adapter` | 18 testów jednostkowych + test całego stosu w Compose: 8 źródeł, 6 harmonogramów, 96 dokumentów (16 sample, 36 web, 45 YouTube) i pierwsze findingi M1/M2/M3. |

### 3.2. `team/ai-core` — Python #1 (`ai/`, moduły M1/M2/M3, prompty, scoring, alerty)

| Data / Etap | Zadanie zlecone AI | Użyte skille | Co zweryfikował / poprawił człowiek |
|---|---|---|---|
| 21.11 · Szkielet `ai/` | FastAPI, Pydantic v2 wg `docs/contracts.md`, `ruff` (z regułą `T20` blokującą `print`), `uv` z `exclude-newer`, `Dockerfile` non-root (`USER app`), `GET /health`. | `dependency-guard`, `risk-classifier` | Zamiana `psycopg` (LGPL-3.0) na `asyncpg` (Apache-2.0); wykrycie testem błędu koercji `Literal[1,2,3]` w query param FastAPI (`int` z `ge=1, le=3`); `pip-audit` = 0 CVE. |
| 21.11 · Klienci DB / S3 / Ollama | `db.py` (pula `asyncpg`), `storage.py` (`boto3`), `llm.py` (Ollama `/api/chat` ze schematem JSON z Pydantic, `temperature: 0`, timeout + retry, błędy podnoszą `LLMError` zamiast domyślnego wyniku). | `dependency-guard`, `risk-classifier` | Odrzucenie `psycopg_pool` (LGPL); 15 testów jednostkowych z mockami. |
| 21.11 · Pipeline `/analyze/{id}` + M2 v1/v2 | Pełny pipeline (`fetch → clean → dedup → embed → route → module → quote validation → upsert findings`), checklista 4 kryteriów M2, walidacja cytatów `rapidfuzz.partial_ratio >= 90`. | `risk-classifier` | Test na żywo z Bielikiem-11B wykazał powielanie jednego cytatu i stałe `confidence=0.5` → stworzono prompt `m2-v2` z obowiązkowym cytatem per kryterium. |
| 21.11 · Issue #18 (`LOG_LEVEL`) | Obsługa `LOG_LEVEL=info` z `.env` (współdzielonego z `pino` w Node) przez `_resolve_log_level()` w `main.py` (konwersja na wielkie litery, mapowanie `trace → DEBUG`). | — | Testy `test_resolve_log_level`, 49 passed, `ruff` czysty. |
| 21.11 · M1, M3, alerty i scenariusze demo | Implementacja `modules/m1.py` (`m1-v1`), `modules/m3.py` (`m3-v1` + `rules/m3.yaml` + anchory embeddingów), `alerts.py` (`POST /internal/alerts` z `X-Internal-Token`), `POST /analyze-text`. | `risk-classifier` | Zmierzono zimny start > 60 s → podniesiono `llm.timeout_s` do 120 s i dodano `keep_alive: 30m` + warm-up; poprawiono regex M3 `twoj\w+` → `tw\w+` („Twoim portfelem”); 4 scenariusze demo przetestowane na żywo z Bielikiem 11B. |
| 21.11 · Issue #41 (Współbieżność modułów) | Równoległe uruchamianie modułów w `run_modules` z budżetem czasu `analysis.budget_s = 240 s` (poniżej timeoutu collectora 300 s) i obsługą częściowego sukcesu bez wymyślania score'u. | `risk-classifier` | 5 testów współbieżności i budżetu (`tests/test_modules.py`), pomiar czasu na lokalnej Ollamie. |

### 3.3. `team/ai-data` — Osoba #3 (preprocessing, tokenizacja i embeddingi, rejestr KNF, M1 matcher, `/eval`)

| Data / Etap | Zadanie zlecone AI | Użyte skille | Co zweryfikował / poprawił człowiek |
|---|---|---|---|
| 21.11 · Rejestr KNF (`entities.csv`) | Skrypt `ai/seed/build_entities.py` łączący surowe zrzuty list KNF (domy maklerskie, banki, firmy zagraniczne) i `overrides.json` do `ai/seed/entities.csv` (86 podmiotów z aliasami i domenami). | `risk-classifier` | Weryfikacja generowanych wariantów nazw i krótkich skrótów (`IG`, `XM`, `XTB`, `ING`) wymagających dopasowania granic słów. |
| 21.11 · Preprocessing, dedup, tokenizacja i embeddingi | `clean_text()` (`trafilatura`), deduplikacja dokładna (SHA-256) i przybliżona (własny 64-bitowy `simhash` na 3-gramach słów bez zewnętrznej paczki), `embed()` (`bge-m3`, `vector(1024)`), idempotentny `seed_entities.py`. | `risk-classifier`, `dependency-guard` | Testy integracyjne na `pgvector` PG16 i Ollamie wykazały, że `HAMMING_THRESHOLD=3` pomija near-duplikat z 1 zmienionym słowem (dystans 5–6) → podniesiono próg do `6`. |
| 21.11 · Dopasowanie podmiotów M1 (`match_entities`) | `ai/app/preprocess/entity_match.py`: dopasowanie nazw i aliasów z polskimi końcówkami fleksyjnymi (do 3 liter), fuzzy matching (`>= 0.88`), wymóg anchora promocyjnego w promieniu 200 znaków dla krótkich skrótów, ekstrakcja dosłownego cytatu (≤ 300 znaków). | `risk-classifier` | Wydajność ~0,17 s dla 1000 słów względem 86 podmiotów; w Issue #26 ujednolicono werdykty `Reason` do kontraktu (`fail` / `unclear`). |
| 21.11 · Ewaluacja i kalibracja (`/eval`) | `evaluate()` i `compute_metrics()` w `ai/app/eval.py` (`tp`, `fp`, `fn`, `tn`, `precision`, `recall`, `total`, `missing_findings` względem `gold.csv`) + zestaw 37 testów i poprawki `ruff`. | `risk-classifier` | Ujednolicenie zmiennej `OLLAMA_URL` w `embeddings.py` (Issue #36 / PR #34) oraz testy ręcznie przeliczonych metryk. |

### 3.4. `team/api` — Osoba #4 (`api/`, `infra/db/`, `docs/contracts.md`)

| Data / Etap | Zadanie zlecone AI | Użyte skille | Co zweryfikował / poprawił człowiek |
|---|---|---|---|
| 21.11 · Schemat DB i kontrakty (`001`–`002`) | `infra/db/001_init.sql` + `002_seed_settings.sql`, indeksy FK i `content_hash`, ograniczenia `CHECK`, `UNIQUE (document_id, module)` oraz notka o signed 64-bit `simhash` w `docs/contracts.md`. | `data-contract`, `supabase-postgres-best-practices` | Test wykonania `001` + `002` z `ON_ERROR_STOP=1` na kontenerze `pgvector/pgvector:pg16` wraz z testami negatywnymi constraintów. |
| 21.11 · Szkielet `api/` i `/findings` | Fastify, TS strict, `zod`, `pino` z maskowaniem `redact`, ESLint `no-console`, non-root `Dockerfile`, `GET /findings` (filtry, paginacja) i `GET /findings/:id` (presigned `screenshotUrl` przez `S3_PUBLIC_ENDPOINT`). | `dependency-guard`, `data-contract` | 11 testów `app.inject` na bazie `pgvector:pg16` (escapowanie `%`/`_` w `ILIKE`, walidacja 400/404, presign `X-Amz-Expires=900`), `npm audit` = 0. |
| 21.11 · Socket.io i `/internal/*` | `POST /internal/alerts` i `POST /internal/crawl-status` chronione `X-Internal-Token` (`timingSafeEqual` na SHA-256 w `onRequest`), emisja `alert:new` i `crawl:status` (CORS = `WEB_ORIGIN`). | `data-contract` | Testy klienta Socket.io na żywym serwerze (401 przy złym/krótkim tokenie, 400 przy `riskLevel != high`, brak wycieku tokenu do logów). |
| 21.11 · Statusy, statystyki, ustawienia, `/sources`, `/eval` | `PATCH /findings/:id/status` (`SELECT ... FOR UPDATE` + `finding_status_history` + `finding:updated`), `/stats/trend`, `/stats/summary`, `GET/PUT /settings/modules/:module`, proxy `GET /eval`, `GET /sources`, `POST /sources/:id/run` (`ioredis@5.11.1`). | `data-contract`, `dependency-guard` | Człowiek i testy złapali 2 błędy SQL: parametr `date_trunc` w `GROUP BY` dla `/stats/trend` oraz kolizję `"id"` w podzapytaniu Drizzle dla `/sources` (`lastRun`) — oba naprawione i pokryte 24 testami `app.inject`. |
| 21.11 · Eksport CSV/JSON i hardening (`003_trgm.sql`) | `GET /export?format=csv\|json` (BOM UTF-8, separator `;` i przecinek dziesiętny pod polski Excel, ochrona przed CSV formula injection `= + - @ TAB CR`, limit 10 000 wierszy i rate-limit 10/min), `infra/db/003_trgm.sql` (indeksy GIN `pg_trgm`), jednolity format błędów `{error, message}`, `api/SECURITY.md`. | `data-contract` | Pomiar `pg_trgm` na 50 000 dokumentach (zapytanie selektywne: 1739 ms → 3 ms), test presigned URL na żywym SeaweedFS 3.96 (#15), 15 testów jednostkowych CSV + 62 testy integracyjne `app.inject`. |

### 3.5. `team/web` — Osoba #5 (`web/` dashboard React + Vite)

| Data / Etap | Zadanie zlecone AI | Użyte skille | Co zweryfikował / poprawił człowiek |
|---|---|---|---|
| 21.11 · Szkielet UI, typy i przełącznik mock/API | Widoki Findingi, Szczegóły, Trendy, Kalibracja, Źródła; synchronizacja typów z `docs/contracts.md`; przełącznik per-endpoint `VITE_MOCKED_ENDPOINTS` z oznaczeniem `DemoBadge`. | `dependency-guard` | Sprawdzenie czystości konsoli przeglądarki (0 błędów/warningów) i zachowania paginacji oraz toastów `alert:new`. |
| 21.11 · Integracja live API i obsługa błędów | Podpięcie `/findings`, `PATCH /findings/:id/status`, `/stats/trend` (uzupełnianie pustych dni zerami), `/stats/summary`, `/eval`, `/settings`, `/sources`; wspólny komponent `QueryState` i polskie komunikaty błędów (`409`, `501`, `502`, `503`). | — | Weryfikacja dozwolonych przejść statusów (`new → in_review → confirmed\|dismissed`) oraz szybkiego retry po awarii API. |
| 21.11 · Styl instytucjonalny, optymalizacja bundla i `SECURITY.md` | Restyle pod czytelność instytucjonalną (wzorzec kolorystyczny `knf.gov.pl`), code-splitting stron `React.lazy` (główny chunk 850 kB → 346 kB), przejście `web/Dockerfile` na `nginx:1.27.5-alpine`, zabezpieczenie eksportu CSV przed formula injection, `web/SECURITY.md` (`npm audit` = 0). | `dependency-guard` | Weryfikacja kontrastu na projektorze, czasu ładowania bundla i otwierania wyeksportowanego CSV z formułą `=1+1` w Excelu. |

### 3.6. `team/infra` — Osoba #6 (`docker-compose.yml`, `infra/`, bezpieczeństwo, dokumentacja, prezentacja)

| Czas | Zadanie zlecone AI | Użyte skille | Co zweryfikował / poprawił człowiek |
|---|---|---|---|
| 21.11 16:52 | Szkielet `docker-compose.yml` (przypięte wersje obrazów, healthchecki, `env_file`), skrypty init SeaweedFS S3 i Ollama (`infra/`), `.env.example`, `.gitignore`. | `dependency-guard` | Sprawdzenie braku sekretów w `git diff --cached` i uprawnień zapisu. |
| 21.11 18:49 | Poprawka `OLLAMA_LLM_MODEL` oraz wykrywania błędów JSON (`"error"` i brak `"status":"success"`) w `infra/ollama/pull-models.sh`. | — | Weryfikacja składni przez `sh -n infra/ollama/pull-models.sh`. |
| 21.11 19:09 | Przegląd bezpieczeństwa zależności (read-only z manifestów i `<serwis>/SECURITY.md`), `README.md` z diagramem Mermaid oraz szkielet prezentacji `presentation/slides.md`. | `sca-audit`, `dependency-guard` | Zweryfikowano zgodność nazw endpointów i modułów z `docs/contracts.md` i `ai/prompts/`. |
| 21.11 19:22–19:25 | Naprawa issues #8, #15 (infra), #16, #17, #19, #37: `.gitattributes` (`eol=lf` dla `.sh`/`.sql`), wartości dev + `S3_PUBLIC_ENDPOINT` + `WEB_ORIGIN` + `SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M` w `.env.example`, usunięcie wolumenu `./infra/seed` i profilu `apps` z `docker-compose.yml`, `docs/SECURITY.md`. | `demo-check`, `dependency-guard` | Potwierdzono brak bajtów `\r` w skryptach `.sh`, `sh -n` oraz zgodność zmiennych z `api/src/config.ts` i `collector/src/config.ts`. |
| 21.11 19:35–19:47 | Zmiana healthchecka `web` w `docker-compose.yml` z `node` na `wget` pod `nginx:1.27.5-alpine` (PR #33), dodanie `ai: condition: service_healthy` w `collector`, utworzenie `presentation/architecture.mmd` i `presentation/DEMO_SCRIPT.md` (0:00–3:00). | `demo-check`, `sca-audit` | Walidacja `docker compose config -q` (kod wyjścia `0`). |
| 21.11 20:33–20:42 | Realizacja Issue #44 (opis zimnego startu > 60 s w `README.md`, skan 10 obrazów przez `docker scout quickview v1.28.0` w `docs/SECURITY.md`, pełny wykaz w `docs/DEPENDENCIES.md`) oraz merge `origin/main` do `team/infra` z rozwiązaniem konfliktów z PR #40. | `dependency-guard`, `demo-check` | Wykryto przestarzałe obrazy w `web/Dockerfile` (`10C/75H` i `18C/68H`) i zgłoszono do `team/web`; wykryto markery konfliktu w lokalnym `.env` przy walidacji `docker compose config -q`. |
| 21.11 20:56 | Realizacja Issues #56 i #52: scalenie pełnego logu zespołu do `docs/AI_PROCESS.md`, uzasadnienie wyboru modeli `Bielik-11B` i `bge-m3` oraz jawny etap „tokenizacja i embeddingi” w `README.md` i `presentation/slides.md`, opis zgłoszeniowy w `presentation/PROJECT_DESCRIPTION.md`. | `dependency-guard`, `demo-check` | Weryfikacja spójności z wymaganiami regulaminowymi UKNF (limit ≤ 12 slajdów, kompletność wykazu i procesu AI). |
