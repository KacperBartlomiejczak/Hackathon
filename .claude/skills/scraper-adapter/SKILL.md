---
name: scraper-adapter
description: Use when adding or changing a data source in collector/ (website, Facebook, Instagram, TikTok, YouTube, or the UKNF sample-data importer), or when touching crawling, the job queue, User-Agent/proxy rotation or the scheduler.
---

# Dodawanie / zmiana źródła danych w `collector/`

## Interfejs adaptera (każde źródło go implementuje)
```ts
// collector/src/adapters/types.ts
export interface SourceAdapter {
  kind: 'web' | 'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'sample';
  /** Zwraca listę URL-i / elementów do pobrania (paginacja, wyszukiwanie po frazach). */
  discover(ctx: CrawlContext): AsyncIterable<DiscoveredItem>;
  /** Pobiera jeden element: HTML, screenshot, metadane. Nie analizuje treści — to robi ai/. */
  fetch(item: DiscoveredItem, ctx: CrawlContext): Promise<CollectedDocument>;
}
```
Rejestracja w `collector/src/adapters/index.ts`. `CollectedDocument` musi pasować do „Format dokumentu z collectora” w `docs/contracts.md`.

## Kroki
1. Utwórz `collector/src/adapters/<kind>.ts`, zaimplementuj `discover` i `fetch`.
2. Jedna strona = jeden job BullMQ (`crawl-item`), żeby błąd jednego URL-a nie zabił całego crawla. Retry: 3, backoff wykładniczy.
3. Przeglądarkę bierz z puli (`ctx.browserPool`) — nie odpalaj nowego Chromium per job.
4. **Rotacja**: `ctx.nextUserAgent()` i `ctx.nextProxy()` (z `PROXY_LIST` w `.env`; pusty = bez proxy). Spec UKNF tego wymaga.
5. Zapis: HTML → S3 (SeaweedFS) `raw/<data>/<url_hash>.html`, screenshot → `shots/...png`, rekord → `documents` (upsert po `url_hash`). Potem `POST ai:8000/analyze/{id}` (fire-and-forget z retry).
6. Aktualizuj `crawl_runs` (items_found, status) i emituj `crawl:status` przez api.
7. Dodaj źródło do `collector/sources.yaml` (collector przy starcie robi upsert do tabeli `sources`), żeby było w demo.

## Zasady
- Grzeczny crawler: limit współbieżności per domena (≤2), opóźnienie 1–3 s z jitterem, respektuj timeouty (30 s).
- Social media: tylko treści publiczne, bez logowania na cudze konta i bez obchodzenia CAPTCHA. Gdy platforma blokuje, adapter zwraca czytelny błąd w `crawl_runs.error` — **nie udajemy wyników**.
- Adapter `sample` wczytuje dane z pendrive'a UKNF (`DATA_DIR` w `.env`) i jest gwarantem demo — zawsze musi działać offline.
- Logi przez `pino` (url, kind, czas, wynik). Żadnego `console.log`.
- Selektory CSS trzymaj w jednym obiekcie na górze pliku — łatwo poprawić w nocy, kiedy strona zmieni układ.

## Szybki test
```bash
npm run crawl -- --source <id> --limit 5   # pobierz 5 elementów i wypisz podsumowanie przez logger
```
Sprawdź: 5 rekordów w `documents`, pliki w S3 (SeaweedFS), findings pojawiły się po chwili w `ai/`.
Na koniec dopisz wpis do `docs/ai-log/lead-collector.md`.
