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
