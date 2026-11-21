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
| GET | `/findings?module=&risk=&status=&source=&from=&to=&q=&page=` | lista z filtrami |
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

Zdarzenia Socket.io: `alert:new` (finding high), `finding:updated`, `crawl:status` (payload jak w `/internal/crawl-status`).

## Kolejka BullMQ (collector, Valkey)
Kolejka `crawl-source`, payload joba (do potwierdzenia z Kacprem):
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
