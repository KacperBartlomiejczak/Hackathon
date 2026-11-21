# Kontrakty — źródło prawdy (schemat DB, JSON, API)

Zmieniasz cokolwiek tutaj? Użyj skilla `data-contract` i zaktualizuj jednocześnie: migrację, typy TS (`api/src/types`, `collector/src/types`, `web/src/types`) i modele Pydantic (`ai/app/models.py`).

## Tabele (PostgreSQL 16 + pgvector)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE sources (
  id            serial PRIMARY KEY,
  kind          text NOT NULL CHECK (kind IN ('web','facebook','instagram','tiktok','youtube','sample')),
  name          text NOT NULL,
  start_url     text,
  module_hint   smallint,                 -- 1/2/3 lub NULL = wszystkie
  enabled       boolean NOT NULL DEFAULT true,
  cron          text                      -- np. '0 */6 * * *'
);

CREATE TABLE crawl_runs (
  id            serial PRIMARY KEY,
  source_id     int REFERENCES sources(id),
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  status        text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','partial','failed')),
  items_found   int DEFAULT 0,
  error         text
);

CREATE TABLE entities (
  id               serial PRIMARY KEY,
  name             text NOT NULL,
  aliases          text[] DEFAULT '{}',
  type             text NOT NULL CHECK (type IN ('investment_firm','foreign_firm','advertiser','finfluencer','advisory_unlicensed','unknown')),
  is_authorized    boolean NOT NULL DEFAULT false,  -- z rejestru KNF
  register_ref     text,                            -- identyfikator w rejestrze KNF
  nip              text,
  official_domains text[] DEFAULT '{}',
  social_handles   text[] DEFAULT '{}'
);

CREATE TABLE documents (
  id             bigserial PRIMARY KEY,
  url            text NOT NULL,
  url_hash       text NOT NULL UNIQUE,
  source_id      int REFERENCES sources(id),
  crawl_run_id   int REFERENCES crawl_runs(id),
  source_kind    text NOT NULL,
  fetched_at     timestamptz NOT NULL DEFAULT now(),
  published_at   timestamptz,
  author_handle  text,
  title          text,
  html_key       text,          -- klucz w S3 (SeaweedFS)
  screenshot_key text,          -- klucz w S3 (SeaweedFS)
  text_clean     text,          -- uzupełnia ai/
  content_hash   text,          -- dedup dokładny
  simhash        bigint,        -- dedup przybliżony; 64-bit ZE ZNAKIEM (patrz notka niżej)
  duplicate_of   bigint REFERENCES documents(id),
  embedding      vector(1024),  -- bge-m3
  status         text NOT NULL DEFAULT 'fetched' CHECK (status IN ('fetched','processed','duplicate','failed'))
);

CREATE TABLE findings (
  id                   bigserial PRIMARY KEY,
  document_id          bigint NOT NULL REFERENCES documents(id),
  module               smallint NOT NULL CHECK (module IN (1,2,3)),
  score                real NOT NULL CHECK (score BETWEEN 0 AND 1),
  risk_level           text NOT NULL CHECK (risk_level IN ('low','medium','high')),
  label                text NOT NULL,            -- np. 'missing_risk_warning'
  reasons              jsonb NOT NULL,           -- [{criterion, verdict, quote, weight}]
  firm_entity_id       int REFERENCES entities(id),
  advertiser_entity_id int REFERENCES entities(id),
  model                text NOT NULL,
  prompt_version       text NOT NULL,
  status               text NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_review','confirmed','dismissed')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, module)   -- jeden finding na dokument i moduł; /reanalyze robi upsert
);

CREATE TABLE finding_status_history (
  id          bigserial PRIMARY KEY,
  finding_id  bigint NOT NULL REFERENCES findings(id),
  old_status  text, new_status text, changed_by text,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE module_settings (
  module     smallint PRIMARY KEY CHECK (module IN (1,2,3)),
  threshold  real NOT NULL DEFAULT 0.6 CHECK (threshold >= 0 AND threshold <= 1),
  weights    jsonb NOT NULL DEFAULT '{"llm":0.6,"rules":0.25,"emb":0.15}'
);
```

**Notka `simhash`:** kolumna `bigint` to 64-bit liczba **ze znakiem** (−2^63 … 2^63−1). Python liczy simhash jako unsigned 64-bit, więc `ai/` musi rzutować: przy zapisie `v - 2**64 if v >= 2**63 else v`, przy odczycie `v + 2**64 if v < 0 else v` (albo `v & 0xFFFFFFFFFFFFFFFF`). Bez tego `INSERT` rzuca `bigint out of range`.

**Notka `findings`:** `UNIQUE (document_id, module)` — zapis z `ai/` ma być upsertem (`INSERT … ON CONFLICT (document_id, module) DO UPDATE`), inaczej `/reanalyze` wywali się na duplikacie.

## Format dokumentu z collectora (wejście do bazy)
```json
{
  "url": "https://...",
  "sourceKind": "instagram",
  "sourceId": 3,
  "crawlRunId": 12,
  "fetchedAt": "2026-11-21T18:02:11Z",
  "publishedAt": null,
  "authorHandle": "@finfluencer_xyz",
  "title": "…",
  "htmlKey": "raw/2026-11-21/abc123.html",
  "screenshotKey": "shots/2026-11-21/abc123.png",
  "extra": { "likes": 1200, "isAd": true }
}
```

## Finding (wyjście z ai/, wejście do api/ i web/)
```json
{
  "documentId": 812,
  "module": 2,
  "score": 0.83,
  "riskLevel": "high",
  "label": "risk_info_insufficient",
  "reasons": [
    { "criterion": "risk_warning_present", "verdict": "fail", "quote": "Zarabiaj nawet 30% miesięcznie!", "weight": 0.4 },
    { "criterion": "risk_prominence", "verdict": "fail", "quote": "…", "weight": 0.3 }
  ],
  "firmEntityId": 4,
  "advertiserEntityId": null,
  "model": "bielik-11b-q4",
  "promptVersion": "m2-v3"
}
```
`riskLevel`: high ≥ 0.8, medium ≥ próg modułu, low < próg.

## API (api/, port 3000)
| Metoda | Ścieżka | Opis |
|---|---|---|
| GET | `/findings?module=&risk=&status=&source=&from=&to=&q=&page=&pageSize=` | lista z filtrami i paginacją |
| GET | `/findings/:id` | szczegóły + dokument + cytaty + link do screenshota |
| PATCH | `/findings/:id/status` | `{status}` → zapis historii + emit `finding:updated` |
| GET | `/stats/trend?module=&bucket=day` | liczba incydentów w czasie (wykres) |
| GET | `/stats/summary` | liczniki per moduł, ryzyko, źródło |
| GET/PUT | `/settings/modules/:module` | próg i wagi |
| GET | `/eval?module=&threshold=` | proxy do ai `/eval` → precision, recall, FP, FN, TP, TN |
| POST | `/sources/:id/run` | ręczne odpalenie crawla (do demo) |
| GET | `/export?format=csv\|json&...filtry` | raport dla modułów 1/2/3 |
| POST | `/internal/alerts` | tylko z ai/ (nagłówek `X-Internal-Token`) |
| POST | `/internal/crawl-status` | tylko z collectora (nagłówek `X-Internal-Token`) → emit `crawl:status` |
| GET | `/sources` | lista źródeł + ostatni `crawl_run` każdego |

`GET /findings` — parametry (wszystkie opcjonalne, błędna wartość → 400):
`module` 1|2|3, `risk` low|medium|high, `status` new|in_review|confirmed|dismissed, `source` = `documents.source_kind` (web|facebook|instagram|tiktok|youtube|sample), `from`/`to` = data ISO, filtr po `findings.created_at`, `q` (1–200 znaków; `ILIKE` po tytule i `text_clean` dokumentu), `page` (domyślnie 1), `pageSize` (domyślnie 20, max 100). Sortowanie: `created_at` malejąco.

`GET /findings` — odpowiedź (bez `reasons` i tekstu dokumentu):
```json
{
  "items": [{
    "id": 7, "module": 2, "score": 0.83, "riskLevel": "high", "label": "risk_info_insufficient",
    "status": "new", "createdAt": "2026-11-21T18:02:11.000Z",
    "document": { "id": 812, "url": "https://…", "title": "…", "sourceKind": "instagram" },
    "firm": { "id": 4, "name": "…" },
    "advertiser": null
  }],
  "page": 1, "pageSize": 20, "total": 134
}
```
`firm` / `advertiser` = `{ id, name }` albo `null`.

`GET /findings/:id` — odpowiedź (404 `{error:"not_found"}`, gdy brak; `id` niebędące liczbą → 400):
```json
{
  "id": 7, "documentId": 812, "module": 2, "score": 0.83, "riskLevel": "high",
  "label": "risk_info_insufficient",
  "reasons": [{ "criterion": "risk_warning_present", "verdict": "fail", "quote": "…", "weight": 0.4 }],
  "firmEntityId": 4, "advertiserEntityId": null, "model": "bielik-11b-q4", "promptVersion": "m2-v3",
  "status": "new", "createdAt": "…",
  "document": {
    "id": 812, "url": "https://…", "sourceId": 3, "sourceKind": "instagram", "fetchedAt": "…",
    "publishedAt": null, "authorHandle": "@…", "title": "…", "textClean": "pełna treść…", "status": "processed"
  },
  "firm": { "id": 4, "name": "…", "aliases": [], "type": "investment_firm", "isAuthorized": true,
            "registerRef": null, "nip": null, "officialDomains": [], "socialHandles": [] },
  "advertiser": null,
  "screenshotUrl": "https://…presigned, ważny 15 min…",
  "statusHistory": [{ "id": 1, "findingId": 7, "oldStatus": "new", "newStatus": "in_review", "changedBy": "…", "changedAt": "…" }]
}
```
`screenshotUrl` = `null`, gdy dokument nie ma screenshotu albo podpisanie URL-a się nie powiodło. `statusHistory` rosnąco po `changedAt`. `firm`/`advertiser` = pełny rekord `entities` albo `null`.

`PATCH /findings/:id/status` — body (`id` nie-liczba → 400):
```json
{ "status": "in_review", "changedBy": "anna", "note": "sprawdzam źródło" }
```
`status` wymagane (`in_review|confirmed|dismissed`); `changedBy` opcjonalny string (1–100 znaków, domyślnie `null`); `note` opcjonalny string (max 500 znaków) — tylko logowany, **nie zapisywany** w bazie. Dozwolone przejścia (bez re-open): `new → in_review`, `in_review → confirmed | dismissed`. Wszystko inne (też ten sam status) → `409 {error:"invalid_transition"}`. Brak findingu → `404 {error:"not_found"}`, zły body → `400`. Zapis `findings.status` + wpis do `finding_status_history` w jednej transakcji. Odpowiedź `200`:
```json
{ "id": 7, "status": "in_review", "oldStatus": "new", "changedAt": "2026-11-21T18:30:00.000Z" }
```

`GET /stats/trend?module=&bucket=&from=&to=` — `module` 1|2|3 (opcjonalny = wszystkie), `bucket` `day|hour` (domyślnie `day`), `from`/`to` = data ISO po `findings.created_at` (opcjonalne). Błędna wartość → 400. Grupowanie `date_trunc(bucket, created_at)`; **bez wypełniania luk** (bucket'y bez findingów nie występują), sortowane rosnąco:
```json
{ "bucket": "day", "module": null, "points": [{ "bucket": "2026-11-21T00:00:00.000Z", "module": 2, "count": 5 }] }
```
Top-level `module` = wartość filtra albo `null`. Punkt = jeden bucket czasu × moduł.

`GET /stats/summary` — bez parametrów. Każda lista to `{ key, count }`, malejąco po `count`, tylko klucze z `count > 0`; `key` to: moduł jako liczba (`byModule`), `low|medium|high` (`byRisk`), `documents.source_kind` (`bySourceKind`), status findingu (`byStatus`):
```json
{
  "total": 134,
  "byModule": [{ "key": 2, "count": 80 }],
  "byRisk": [{ "key": "high", "count": 31 }],
  "bySourceKind": [{ "key": "instagram", "count": 52 }],
  "byStatus": [{ "key": "new", "count": 100 }]
}
```

`POST /internal/crawl-status` — payload:
```json
{ "crawlRunId": 12, "sourceId": 3, "status": "running", "itemsFound": 0, "error": null }
```
`status`: `running|ok|partial|failed`; `error` opcjonalne.

`GET /sources` — element listy:
```json
{
  "id": 3, "kind": "web", "name": "…", "startUrl": "https://…", "moduleHint": null,
  "enabled": true, "cron": "0 */6 * * *",
  "lastRun": { "id": 12, "status": "ok", "startedAt": "…", "finishedAt": "…", "itemsFound": 14, "error": null }
}
```
`lastRun` = `null`, gdy źródło nie było jeszcze crawlowane.
Odpowiedź `GET /sources` to tablica tych elementów, sortowana rosnąco po `id`. `lastRun` = najnowszy `crawl_run` po `started_at`.

`POST /sources/:id/run` — bez body. Dodaje job do kolejki `crawl-source` (patrz „Kolejka BullMQ”) z payloadem `{ sourceId, trigger: "manual" }`; działa też dla `enabled = false` (ręczny trigger do demo). `id` nie-liczba → `400`, brak źródła → `404 {error:"not_found"}`, Valkey niedostępny → `503 {error:"queue_unavailable"}`. Sukces `202`:
```json
{ "ok": true, "jobId": "17", "sourceId": 3 }
```
api **nie** emituje `crawl:status` — robi to collector przez `/internal/crawl-status`, gdy założy `crawl_run`.

`GET /settings/modules/:module` — `module` 1|2|3 (inaczej `400`), brak wiersza → `404 {error:"not_found"}`. Odpowiedź `200`:
```json
{ "module": 2, "threshold": 0.6, "weights": { "llm": 0.6, "rules": 0.25, "emb": 0.15 } }
```
`PUT /settings/modules/:module` — pełna zamiana (wszystkie pola wymagane), upsert do `module_settings`. Body w tym samym kształcie bez `module`:
```json
{ "threshold": 0.7, "weights": { "llm": 0.5, "rules": 0.3, "emb": 0.2 } }
```
`threshold` i każda waga 0–1, `weights` dokładnie `llm|rules|emb` (inne klucze → `400`), suma wag = 1 (±0.01), inaczej `400`. Odpowiedź `200` jak w GET. `weights.llm|rules|emb` odpowiadają `w_llm|w_rules|w_emb` z `ai/config.yaml`.

`GET /eval?module=&threshold=` — `module` 1|2|3, `threshold` 0–1 (oba wymagane, inaczej `400`). api przekazuje zapytanie do `${AI_URL}/eval` i zwraca status i body z ai 1:1 (np. `501`, dopóki ai nie ma implementacji). ai nieosiągalne / timeout (`EVAL_TIMEOUT_MS`, domyślnie 30 s) → `502 {error:"ai_unavailable"}`. Odpowiedź `200` (= `EvalResult` z `ai/app/models.py`):
```json
{ "module": 2, "threshold": 0.7, "tp": 5, "fp": 1, "fn": 2, "tn": 10, "precision": 0.83, "recall": 0.71 }
```

`POST /internal/alerts` — body (wysyła ai po zapisaniu findingu z `riskLevel = high`; `X-Internal-Token` wymagany, brak/zły → `401 {error:"unauthorized"}`, zły body → `400`, sukces → `202 {ok:true}`):
```json
{
  "findingId": 7, "documentId": 812, "module": 2, "score": 0.83, "riskLevel": "high",
  "label": "risk_info_insufficient", "title": "…", "url": "https://…",
  "firm": { "id": 4, "name": "…" }, "createdAt": "2026-11-21T18:02:11.000Z"
}
```
`riskLevel` musi być dokładnie `"high"`. `score` 0–1, `module` 1|2|3, `title` = `string` albo `null` (gdy dokument nie ma tytułu), `firm` = `{ id, name }` albo `null`, `createdAt` = ISO 8601. Ten sam obiekt api emituje 1:1 jako `alert:new` (bez dociągania z bazy).
`POST /internal/crawl-status` odpowiada tak samo (`401` / `400` / `202`), a payload emituje 1:1 jako `crawl:status`.

`finding:updated` — payload emitowany po udanym `PATCH /findings/:id/status`:
```json
{ "id": 7, "module": 2, "riskLevel": "high", "oldStatus": "new", "status": "in_review", "changedBy": null, "changedAt": "2026-11-21T18:30:00.000Z" }
```

Zdarzenia Socket.io: `alert:new` (payload jak body `/internal/alerts`), `finding:updated` (payload wyżej), `crawl:status` (payload jak w `/internal/crawl-status`). CORS Socket.io = tylko `WEB_ORIGIN`.

## Kolejka BullMQ (collector, Valkey)
Kolejka `crawl-source` (Valkey z `VALKEY_URL`), nazwa joba `crawl:<sourceId>`, payload joba (do potwierdzenia z Kacprem):
```json
{ "sourceId": 3, "trigger": "manual" }
```
`trigger`: `manual` (`POST /sources/:id/run`) lub `schedule` (harmonogram z `sources.cron`).

## AI (ai/, port 8000)
| Metoda | Ścieżka | Opis |
|---|---|---|
| POST | `/analyze/{document_id}` | preprocessing → dedup → embedding → moduły → findings |
| POST | `/reanalyze?module=` | ponowna analiza (po zmianie promptu) |
| GET | `/eval?module=&threshold=` | metryki na `gold.csv` |
| GET | `/health` | status + czy Ollama odpowiada |
