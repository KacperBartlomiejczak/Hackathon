# collector — zależności

| paczka | wersja | licencja | po co |
|---|---|---|---|
| pino | 10.4.0 | MIT | logger |
| zod | 4.6.7 | MIT | walidacja env i sources.yaml |
| yaml | 2.9.1 | ISC | parsowanie sources.yaml |
| typescript | 5.9.3 | Apache-2.0 | kompilacja (dev) |
| tsx | 4.23.15 | MIT | uruchamianie TS w dev (dev) |
| @types/node | 22.20.5 | MIT | typy Node (dev) |
| bullmq | 6.7.8 | MIT | kolejki crawl-source / crawl-item na Valkey |
| playwright | 1.65.1 | Apache-2.0 | pobieranie stron, screenshoty |
| p-limit | 7.3.3 | MIT | limit współbieżności per domena |
| drizzle-orm | 0.45.4 | Apache-2.0 | zapytania do Postgresa (wersja jak w api/) |
| pg | 8.23.1 | MIT | sterownik Postgresa |
| @aws-sdk/client-s3 | 3.1175.0 | Apache-2.0 | zapis HTML/screenshotów do SeaweedFS (S3) |
| eslint | 10.15.0 | MIT | lint, reguła no-console (dev) |
| typescript-eslint | 8.73.0 | MIT | lint TS (dev) |
| @types/pg | 8.23.1 | MIT | typy pg (dev) |

Obraz bazowy: build `node:22.23.5-bookworm-slim`, runtime `mcr.microsoft.com/playwright:v1.65.1-noble` (Apache-2.0, wersja = paczka playwright).

Uwaga: npm zablokował install script `msgpackr-extract` (opcjonalny natywny akcelerator zależności bullmq) — działa fallback w czystym JS.
