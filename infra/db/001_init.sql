-- InvestWatch schema. Source of truth: docs/contracts.md (change only via the data-contract skill).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE sources (
  id            serial PRIMARY KEY,
  kind          text NOT NULL CHECK (kind IN ('web','facebook','instagram','tiktok','youtube','sample')),
  name          text NOT NULL,
  start_url     text,
  module_hint   smallint,                 -- 1/2/3 or NULL = all
  enabled       boolean NOT NULL DEFAULT true,
  cron          text                      -- e.g. '0 */6 * * *'
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
  is_authorized    boolean NOT NULL DEFAULT false,  -- from the KNF register
  register_ref     text,                            -- identifier in the KNF register
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
  html_key       text,          -- S3 key (SeaweedFS)
  screenshot_key text,          -- S3 key (SeaweedFS)
  text_clean     text,          -- filled by ai/
  content_hash   text,          -- exact dedup
  simhash        bigint,        -- near dedup; signed 64-bit (ai/ must cast u64 <-> i64)
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
  label                text NOT NULL,            -- e.g. 'missing_risk_warning'
  reasons              jsonb NOT NULL,           -- [{criterion, verdict, quote, weight}]
  firm_entity_id       int REFERENCES entities(id),
  advertiser_entity_id int REFERENCES entities(id),
  model                text NOT NULL,
  prompt_version       text NOT NULL,
  status               text NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_review','confirmed','dismissed')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, module)   -- one finding per document and module; /reanalyze upserts
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

-- Indexes: list filters (GET /findings) and trend/summary queries.
CREATE INDEX findings_filter_idx ON findings (module, risk_level, status, created_at DESC);
CREATE INDEX documents_source_kind_fetched_idx ON documents (source_kind, fetched_at);

-- Indexes on foreign keys used in joins (Postgres does not create them automatically).
CREATE INDEX findings_document_id_idx ON findings (document_id);
CREATE INDEX findings_firm_entity_id_idx ON findings (firm_entity_id);
CREATE INDEX findings_advertiser_entity_id_idx ON findings (advertiser_entity_id);
CREATE INDEX documents_source_id_idx ON documents (source_id);
CREATE INDEX documents_crawl_run_id_idx ON documents (crawl_run_id);
CREATE INDEX crawl_runs_source_started_idx ON crawl_runs (source_id, started_at DESC);
CREATE INDEX finding_status_history_finding_idx ON finding_status_history (finding_id, changed_at);

-- Dedup lookups from ai/.
CREATE INDEX documents_content_hash_idx ON documents (content_hash);
