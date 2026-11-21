# AI log — lead-collector

## 2026-11-21 — szkielet collectora
- Zlecono: init `collector/` (TS strict, pino, zod, Dockerfile, sources.yaml, typy adaptera wg skilla `scraper-adapter`).
- Skille: `scraper-adapter`, `dependency-guard` (wersje przypięte, licencje sprawdzone w npm).
- Do weryfikacji przez człowieka: `docker build collector/`, kontrakt `CollectedDocument` vs `docs/contracts.md`.
## 2026-11-21 — krok 6 (dokończenie) + 9: szkielet collectora
- Zlecono: paczki (bullmq, playwright, drizzle, pg, s3, p-limit, eslint), typy z contracts.md, schemat Drizzle (sources/crawl_runs/documents), klient S3, ESLint no-console, Dockerfile na obrazie Playwright.
- Skille: `dependency-guard` (wersje przypięte, licencje MIT/Apache, `npm audit` = 0). Plan zaakceptowany przez człowieka przed zmianami; 4 subagenty (Sonnet) równolegle, każdy jeden moduł.
- Weryfikacja: review kodu przez lead-agenta (dodany handler `pool.on('error')`), `tsc`, `eslint`, `docker build` OK; obraz ma Node 26.
