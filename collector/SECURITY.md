# collector — bezpieczeństwo

## Skany zależności

### 2026-11-22 — przed oddaniem
`npm audit --audit-level=high` (npm 11.20.0, `package-lock.json`)
Wynik: **found 0 vulnerabilities**. `npm audit --omit=dev` daje też 0. Lockfile ma 208 pakietów (122 dev, 37 opcjonalnych).
Wcześniejsze skany: 2026-11-21 (Issue #44, `docs/ai-log/lead-collector.md`) — też 0. CI (`.github/workflows/ci.yml`) powtarza `npm audit --audit-level=high` na każdym PR.

Licencje i wersje paczek: `DEPENDENCIES.md`. Wszystkie wersje są przypięte dokładnie (bez `^` i `~`).

## Zabezpieczenia w kodzie

| Obszar | Co jest | Gdzie |
|---|---|---|
| SSRF (#74) | Adapter `web` i `tiktok` przyjmuje tylko `http:`/`https:`, sprawdza adresy z DNS przez `net.BlockList` i odrzuca pętlę zwrotną, sieci prywatne, link-local, CGNAT, IPv6 ULA oraz mapowane IPv4 (`::ffff:…`). `context.route('**/*')` stosuje to samo do każdego żądania Chromium, także po przekierowaniu, więc item kończy się błędem i nic nie trafia do S3. Discovery sprawdza `startUrl` i adres po przekierowaniu. | `src/adapters/ssrf.ts`, `web.ts`, `tiktok.ts` |
| Walidacja konfiguracji | Wszystkie zmienne środowiskowe przechodzą przez `zod` przy starcie. `PROXY_LIST` musi składać się z adresów `http(s)://` lub `socks5://`, zły wpis zatrzymuje start. | `src/config.ts` |
| Walidacja źródeł | Struktura `sources.yaml` (rodzaj źródła, adresy) jest opisana schematem `zod` (`sourcesFileSchema`). | `src/sources.ts` |
| Token do ai i api (#70) | `POST /analyze` wysyła `X-Internal-Token` (`INTERNAL_TOKEN`), więc ai może włączyć `AI_REQUIRE_TOKEN=true`. Ten sam nagłówek idzie na `POST /internal/crawl-status` w api. Test z atrapą serwera sprawdza nagłówek. | `src/ai/client.ts`, `src/api/client.ts` |
| Brak sekretów w logach | Logger `pino` nie zapisuje tokenów ani adresów proxy: w wywołaniach logera jest tylko id dokumentu, status i komunikat. W kodzie nie ma `console.*` (ESLint `no-console`). | `src/logger.ts`, `eslint.config.js` |
| Treść stron to dane | Collector zapisuje HTML i screenshot bez interpretacji. Analizę i izolację treści od promptów robi ai (`<document>` + `neutralize_delimiters`). | `src/pipeline.ts` |
| Obciążenie źródeł | Limit 2 równoległych żądań na host, jitter 1–3 s, losowy User-Agent z listy 23, opcjonalne proxy. | `src/adapters/web.ts`, `src/userAgents.ts` |
| Ograniczenie obciążenia ai | `ANALYZE_CONCURRENCY` (domyślnie 1), timeout `AI_ANALYZE_TIMEOUT_MS`, jeden ponowny `/analyze` po 502 po `AI_RETRY_DELAY_MS`, brak drugiego wywołania dla dokumentu będącego w locie. | `src/ai/client.ts` |
| Obraz Dockera | Przypięty `mcr.microsoft.com/playwright:v1.65.1-noble` (wersja musi się zgadzać z paczką `playwright`), build multi-stage na `node:22.23.5-bookworm-slim`, `npm ci --omit=dev`. Działa jako `USER pwuser`, nie root. | `Dockerfile` |
| Sieć | `collector` nie publikuje żadnych portów w `docker-compose.yml`, sam łączy się z `postgres`, `valkey`, `seaweedfs`, `ai` i `api` po nazwach usług. | `docker-compose.yml` |
| Dane próbne | W repo są tylko syntetyczne fixtures (`fixtures/sample`). Snapshot gold setu (`gold-crawl.jsonl`, 22 MB, treści stron trzecich) jest poza repo. Dane z pendrive'a UKNF nie trafiają do repo (Issue #56). | `fixtures/sample/` |

## Znane ograniczenia (świadome decyzje)
- **Okno DNS rebinding.** `isBlockedUrl` sprawdza DNS przed żądaniem, a Chromium rozwiązuje nazwę jeszcze raz. W produkcji trzeba przypiąć IP przez proxy. Na demo zostawiamy.
- **`INTERNAL_TOKEN` ma w collectorze domyślnie pustą wartość** (`src/config.ts`). Bez niego api odrzuca `/internal/crawl-status` (min. 16 znaków), a ai z `AI_REQUIRE_TOKEN=true` odrzuca `/analyze`. Compose ładuje token z `.env`.
- **Kolejka analiz jest w pamięci procesu.** Restart collectora gubi oczekujące wywołania `/analyze`, dokumenty zostają ze statusem `fetched` i dostają analizę przy kolejnym crawlu.
- **TikTok:** listing profilu zwraca w trybie headless pusty `itemList`. Nie obchodzimy blokady, w `sources.yaml` są pojedyncze filmy.
- **Proxy i rotacja User-Agent** utrudniają blokowanie, ale nie zastępują zgody właściciela serwisu na scraping. Źródła w `sources.yaml` to publiczne strony i kanały.
