# AI log — lead-collector

## 2026-11-21 — szkielet collectora
- Zlecono: init `collector/` (TS strict, pino, zod, Dockerfile, sources.yaml, typy adaptera wg skilla `scraper-adapter`).
- Skille: `scraper-adapter`, `dependency-guard` (wersje przypięte, licencje sprawdzone w npm).
- Do weryfikacji przez człowieka: `docker build collector/`, kontrakt `CollectedDocument` vs `docs/contracts.md`.
## 2026-11-21 — krok 6 (dokończenie) + 9: szkielet collectora
- Zlecono: paczki (bullmq, playwright, drizzle, pg, s3, p-limit, eslint), typy z contracts.md, schemat Drizzle (sources/crawl_runs/documents), klient S3, ESLint no-console, Dockerfile na obrazie Playwright.
- Skille: `dependency-guard` (wersje przypięte, licencje MIT/Apache, `npm audit` = 0). Plan zaakceptowany przez człowieka przed zmianami; 4 subagenty (Sonnet) równolegle, każdy jeden moduł.
- Weryfikacja: review kodu przez lead-agenta (dodany handler `pool.on('error')`), `tsc`, `eslint`, `docker build` OK; obraz ma Node 26.
## 2026-11-21 — krok 10: kolejki BullMQ
- Zlecono: `collector/src/queue/index.ts` (kolejki `crawl-source`/`crawl-item`, retry 3, backoff wykładniczy, concurrency 1/4) + podpięcie w `index.ts` z graceful shutdown. Plan zaakceptowany przed zmianami; 2 subagenty (Sonnet, high) równolegle ze sztywno ustalonym interfejsem.
- Skille: `dependency-guard` — test na żywo wykazał, że bullmq 6 ma `ioredis` jako opcjonalny peer (Queue/Worker nie startowały); dodano `ioredis@5.11.1` (MIT, OSV czysto, `npm audit` = 0) po akceptacji człowieka.
- Weryfikacja: `tsc`, `eslint`, test na tymczasowym Valkey 8.1.12 — 1 job `crawl-source` + 1 `crawl-item` przetworzone. Handlery to na razie stuby (kroki 12–14).
## 2026-11-21 — kroki 12–14: adapter sample, adapter web, /analyze
- Zlecono: adapter `sample` (ogólny format html/json/jsonl z `DATA_DIR`, syntetyczne fixture'y — brak danych z pendrive'a, mapowanie do poprawy), adapter `web` (wspólny Chromium, kontekst per item z UA/proxy, limit 2/host, jitter, screenshot), klient `POST /analyze` (3 próby, 501/4xx = koniec, nigdy nie rzuca), `pipeline.ts` (crawl_runs, upsert `documents` po `url_hash`). Plan zaakceptowany przed zmianami; lead-agent ustalił interfejs (`CrawlContext.storage/source`), 3 subagenty (Sonnet) równolegle, każdy na jednym pliku.
- Skille: `scraper-adapter`; zero nowych paczek.
- Weryfikacja: review kodu przez lead-agenta, `tsc`, `eslint`, 5 testów `node:test`, test na żywo na tymczasowym Postgres/Valkey/SeaweedFS: 5 dok. sample + 1 web w `documents`, HTML i screenshot w S3, `crawl_runs` ok, ai niedostępne → log + status `fetched`, ponowny crawl = upsert (bez duplikatów).
## 2026-11-21 — sources.yaml → baza, crawl przy starcie, fixtures w obrazie
- Zlecono: `syncSources` (upsert `sources` po (kind, name), bez zmiany schematu), job `crawl-source` (trigger `manual`) dla każdego włączonego źródła przy starcie (`CRAWL_ON_START`, domyślnie true), `COPY fixtures/sample /data/sample` w Dockerfile (pusty wolumen `collector_data` kopiuje to przy pierwszym utworzeniu), example.com wyłączony. Plan zaakceptowany przed zmianami.
- Skille: brak nowych paczek.
- Weryfikacja: `tsc`, `eslint`, 5 testów; compose na main + PR #12 (+ poprawki z issues #16/#17/#18 i `OLLAMA_BASE_URL` w .env): 2 wiersze w `sources`, 1 `crawl_run` ok (5 items), 5 dokumentów, `/analyze` 200 dla wszystkich. 0 findingów, bo fixtures mają fikcyjne firmy spoza rejestru (M1 candidates=0).
- Do zrobienia: fixtures z firmami z rejestru (np. XTB) i ≥ 10 dokumentów (DoD 19:00); `POST /sources/:id/run` po stronie api.
## 2026-11-21 — fix blokerów demo (lead override: infra + ai-core)
- Zlecono: przegląd otwartych issues → plan → poprawki #16 (wolumen seed w `ai`), #17 (`.gitattributes`, LF dla .sh/.sql), #18 (`LOG_LEVEL.upper()`), #19 (`SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M`, `pull-models.sh` kończy się błędem przy `"error"`), #8 (dev wartości w `.env.example`: Postgres, `INTERNAL_TOKEN`, klucze S3). Plan zaakceptowany przed zmianami.
- Skille: brak nowych paczek. Nazwa modelu sprawdzona w rejestrze Ollamy (200).
- Weryfikacja: `cp .env.example .env && docker compose --profile apps up` (bez `web`): wszystkie serwisy healthy, init-y exit 0, Bielik 6.7 GB + bge-m3 pobrane, `/health` ai i api 200. Człowiek zaakceptował plan i nadpisanie `.env`; agent sam cofnął błędny `sed` w compose.
- Do zrobienia (poza zakresem): profil `apps` w compose (samo `up` nie startuje aplikacji), README/SECURITY.md (#8).
## 2026-11-21 — fix po review PR #11: postAnalyze bez zdublowanych analiz
- Zlecono: review PR-ów #11–#13 pod kątem podatności/wydajności (merge #13 i #11, #12 wstrzymany do #16), potem poprawka `postAnalyze`: timeout 60 s → 300 s, ponowienie tylko po błędzie połączenia i 503; timeout, 502 i inne kody kończą bez retry (inaczej LLM liczył ten sam dokument 2–3 razy). Plan zaakceptowany przed zmianami.
- Skille: brak nowych paczek.
- Weryfikacja: `tsc`, `eslint`, 7 testów `node:test` (nowe: 502 bez retry, timeout bez retry).
## 2026-11-21 — issue #22: ręczny crawl wyłączonych źródeł + /internal/crawl-status
- Zlecono: przegląd otwartych issues dla collectora → plan → poprawka #22. `onSource` pomija wyłączone źródło tylko przy `trigger === 'schedule'`; nowy `postCrawlStatus` (X-Internal-Token, timeout 5 s, nigdy nie rzuca) wysyła `running` po insercie `crawl_run` i `ok|partial|failed` po update. Plan zaakceptowany przed zmianami.
- Skille: brak nowych paczek (globalny `fetch`).
- Weryfikacja: `tsc`, `eslint`, 9 testów `node:test` (nowe: nagłówek + body, zamknięty port bez wyjątku). Bez testu na żywo z api.
## 2026-11-21 — issue #19: weryfikacja poprawki i przekazanie do team/infra
- Zlecono: wybrać jeden issue → plan → weryfikacja niezacommitowanej poprawki #19 (plus #16/#17) i przekazanie jej osobie #6 jako patch, bo team/lead-collector nie commituje plików infra. Plan zaakceptowany przed zmianami.
- Skille: brak nowych paczek. Manifest `SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M` w registry.ollama.ai: 200, nazwa bez namespace: 404.
- Weryfikacja: `docker compose run --rm --no-deps ollama-init` ze zmyślonym modelem → exit 1, z prawdziwym → exit 0. Patch (4 pliki) sprawdzony `git apply --check -R`. Komentarze w #19, #16, #17.
## 2026-11-21 — kroki 16–17: fixtures z firmami z rejestru + CLI crawl
- Zlecono: `fixtures/sample/demo.jsonl` (11 syntetycznych rekordów, tytuły `[SYNTETYCZNE]`: 4× M1, 3× M2, 2× M3, 2 negatywy) z firmami z `entities.csv` (XTB, DM BOŚ, mBank, Noble), `src/cli.ts` + `npm run crawl -- --source <id>`. Plan zaakceptowany przed zmianami; `--limit` pominięty (zmiana payloadu `crawl-source` = kontrakt z api).
- Skille: `scraper-adapter`; zero nowych paczek. 2 subagenty (Sonnet) równolegle: dry-run `route_document` na fixture'ach, test na żywo w compose.
- Weryfikacja: `tsc`, `eslint`, 9 testów; routing 11/11 zgodny z oczekiwanym modułem (po zmianie „Gwarantujemy” → „Gwarantowany” reguły M2 łapią też Noble). Na żywo: CLI kolejkuje job, 16 dokumentów `processed`, 2 findingi M2 (high). M1/M3 = 0, bo w `ai/app/modules` jest tylko M2 (ai-core).
- Blokery u innych: `ai/app/embeddings.py` czyta `OLLAMA_BASE_URL` zamiast `OLLAMA_URL` → każdy `/analyze` = 502 (ai-data); Bielik > 60 s na CPU powoduje timeout LLM.

## 2026-11-21 — issues #30, #29, #25 (strona web): code-split, prawdziwy `/export`, escaping CSV (wyjątek od własności za zgodą leada)
- Zlecono: plan #30 (subagenty Sonnet do analizy web i specyfikacji `/export` z `origin/team/api`), potem implementacja. `React.lazy` dla stron (recharts tylko w chunku Trends), `export` usunięty z `DEFAULT_MOCKED`, komunikat o `X-Export-Truncated`, typ `ExportJson`, prefiks `'` w `csvField` dla `= + - @ TAB CR`.
- Zero nowych paczek. Weryfikacja: `npm run build` (tsc + vite) bez warningu o chunkach >500 kB, `npm audit` = 0. Web nie ma lintu ani testów. Nie zrobione: Dockerfile → nginx (wymaga zmiany healthchecka w compose, który należy do infra). Mock CSV przestawiony na separator `;` (jak api). Suspense w `Layout`, żeby nawigacja nie znikała.

## 2026-11-21 — issue #8 (czysty start) + #15/#16/#17/#19/#37
Zlecono: plan i wdrożenie poprawek infra (wyjątek od własności za zgodą leada). Subagenci (sonnet) prześledzili statycznie `docker compose up --build` i zweryfikowali README/SECURITY.md.
Zrobione: usunięty profil `apps`, depends_on (ai→ollama-init/s3-init, collector→api/ai), `.env.example` z wartościami dev + `S3_PUBLIC_ENDPOINT` + `WEB_ORIGIN`, `.gitattributes` LF, poprawny tag Bielika, README, docs/SECURITY.md. Sprawdzone: `docker compose config`, `docker manifest inspect` wszystkich obrazów, manifest Bielika w rejestrze Ollamy (200), build api z HEAD. Pełnego `up` nie uruchamiano.

## 2026-11-21 — issue #43 (analiza w collectorze: współbieżność, timeout, re-crawl)
Zlecono: plan zaakceptowany przed zmianami. Znalezione przy okazji: `void postAnalyze` w `onItem` nie ogranicza równoległości (N dokumentów = N naraz do jednego Bielika), a upsert resetował `status` na `fetched` przy każdym re-crawlu.
Zrobione: semafor `ANALYZE_CONCURRENCY` (domyślnie 1) w `ai/client.ts`, timeout z `AI_ANALYZE_TIMEOUT_MS` (300 s, poprawiony komentarz), upsert nie rusza `status`, `/analyze` tylko dla `fetched`. Test: 3 analizy naraz → max 1 aktywna.
Zweryfikowane: `tsc`, `eslint`, 7 testów klienta. Nie sprawdzone: test pipeline'u na bazie (re-crawl) i budżet timeoutu — czeka na decyzję ai-core w #41. Kolejka w pamięci: restart collectora gubi oczekujące analizy (dokumenty zostają `fetched`).
## 2026-11-21 — krok 19: rotacja User-Agentów i walidacja proxy
- Zlecono: lista 23 realnych UA (Chrome/Edge/Firefox/Safari/Opera, Windows/macOS/Linux/Android/iOS) w `src/userAgents.ts`, losowy UA per item zamiast round-robin z 3; walidacja `PROXY_LIST` (każdy wpis to URL http/https/socks5, pusty = bez proxy). Jitter 1–3 s i limit 2/host już były w adapterze web. Plan zaakceptowany przed zmianami.
- Skille: `scraper-adapter`; zero nowych paczek.
- Weryfikacja: `tsc`, `eslint`, 12 testów `node:test` (nowe: ≥ 20 unikalnych UA, losowanie z listy); `PROXY_LIST=foo` → błąd zod przy starcie. Proxy nie testowane na żywo (brak proxy).
## 2026-11-21 — krok 20: discovery linków w adapterze web + 3 blogi live
- Zlecono: `src/adapters/discovery.ts` (`extractLinks`: linki z tego samego hosta, bez plików, duplikatów i `www.`, filtr słów kluczowych po URL-u i tekście odnośnika bez polskich znaków, max 20), `web.discover` = start_url + linki z głębokości 1 (zwykły `fetch`, timeout 15 s; błąd = tylko start_url), w `sources.yaml` 3 blogi (jakoszczedzacpieniadze.pl, marciniwuc.com, subiektywnieofinansach.pl). Plan zaakceptowany przed zmianami.
- Skille: `scraper-adapter`; zero nowych paczek.
- Weryfikacja: `tsc`, `eslint`, 14 testów (nowe: filtr hosta, deduplikacja, zły `%`-escape, limit); discovery na żywo: 3 / 7 / 20 linków. Pełny crawl z Playwrightem w compose nie był powtarzany (ścieżka `fetch` bez zmian).
## 2026-11-21 — krok 22: adapter YouTube (publiczny RSS kanału)
- Zlecono: `src/adapters/youtube.ts`: `channel_id` z URL-a `/channel/UC…` albo ze strony `@handle` (cookie zgody `SOCS`), RSS `feeds/videos.xml` → 1 dokument na film (tytuł, kanał, data, opis; HTML z escapowaniem, bez screenshotu). Kanały wybrał agent i sprawdził je na żywo: Strefa Inwestorów, Inwestomat (finfluencerzy), XTB Polska (oficjalny). Plan zaakceptowany przed zmianami.
- Skille: `scraper-adapter`; zero nowych paczek (fetch + regex, bez parsera XML, bez klucza API).
- Weryfikacja: `tsc`, `eslint`, 17 testów (nowe: parser RSS z encjami i złym videoId, escaping HTML, channelId bez sieci); discover na żywo: 3 × 15 filmów z opisami. Bez pełnego crawla w compose.
## 2026-11-21 — krok 25: harmonogram z `sources.cron`
- Zlecono: `src/scheduler.ts` (`syncSchedulers`: dla każdego włączonego źródła z cronem BullMQ `upsertJobScheduler('source-<id>', { pattern, tz: 'Europe/Warsaw' })` z payloadem `{ sourceId, trigger: 'schedule' }`; zły cron = log error tylko dla tego źródła; nieaktualne `source-*` usuwane), wywołanie przy starcie w `index.ts`, `syncSources` zwraca też `cron`, blogi i YouTube co 6 h w `sources.yaml`. Plan zaakceptowany przed zmianami.
- Skille: `scraper-adapter`; zero nowych paczek.
- Weryfikacja: `tsc`, `eslint`, 18 testów (nowy: dodanie, pominięcie wyłączonego i bez crona, zły cron, usunięcie nieaktualnego); na żywo w Valkey na osobnej kolejce testowej: harmonogram zapisany z tz, zły cron odrzucony przez BullMQ, nieaktualny usunięty, zaplanowany job ma `trigger: 'schedule'`; kolejka testowa skasowana.
## 2026-11-21 — test kroków 19–25 w compose + ponowna analiza `failed`
- Zlecono: test całości w compose, potem jedna linijka w `pipeline.ts`: `/analyze` także dla dokumentów `failed` (przy re-crawlu), żeby dokumenty z wcześniejszych błędów 502 dostały szansę na analizę. Akceptacja człowieka przed zmianą.
- Skille: brak nowych paczek.
- Weryfikacja na żywo: 8 źródeł, 6 harmonogramów, 7 crawl_runs `ok`, 96 dokumentów (16 sample, 36 web, 45 YouTube), pierwsze findingi M1/M2/M3. Zgłoszone do ai-core: `M1Output` odrzuca odpowiedź Bieliko (walidacja Pydantic), ~90 s na dokument na CPU. Po zmianie: `tsc`, `eslint`, 18 testów.
## 2026-11-21 — issue #43: budżet czasu `/analyze`
- Zlecono: przegląd issues dla lead-collector i plan; po akceptacji: domyślny `AI_ANALYZE_TIMEOUT_MS` 300 s → 600 s (M1+M2+M3 sekwencyjnie, LLM do 120 s na zimno), dedupe dokumentu w locie w `ai/client.ts` (overlapping re-crawl nie odpala drugiego `/analyze`), błąd analizy dopisywany do `crawl_runs.error` w `pipeline.ts`.
- Skille: brak nowych paczek.
- Weryfikacja: `tsc`, `eslint`, 8 testów klienta (nowy: ten sam dokument w locie = 1 wywołanie). Nie sprawdzone: pełny `docker compose up --build` (demo-check pkt 1–2).
