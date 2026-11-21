-- Trigram indexes for the `q` filter of GET /findings and GET /export:
-- ILIKE '%…%' on documents.title / documents.text_clean cannot use a btree index (issue #27).
-- Runs after 001/002 only on an empty volume (docker-entrypoint-initdb.d); safe to re-run by hand.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS documents_title_trgm_idx
  ON documents USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS documents_text_clean_trgm_idx
  ON documents USING gin (text_clean gin_trgm_ops);
