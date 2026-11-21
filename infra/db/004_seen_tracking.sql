-- M1 periodic update (issue #55): when an ad was first and last seen by the crawler.
-- The collector upserts documents on url_hash and overwrites fetched_at on every re-crawl
-- (cron in collector/sources.yaml), so a trigger derives both columns without collector changes.
-- "Still active" is computed in api/ against the source's latest successful crawl_run.
-- Runs after 001-003 only on an empty volume (docker-entrypoint-initdb.d); idempotent, so an
-- existing database can be updated by hand: psql -f infra/db/004_seen_tracking.sql

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at  timestamptz;

-- Backfill rows that existed before this migration (best known value: the last fetch).
UPDATE documents
   SET first_seen_at = coalesce(first_seen_at, fetched_at),
       last_seen_at  = coalesce(last_seen_at, fetched_at)
 WHERE first_seen_at IS NULL OR last_seen_at IS NULL;

ALTER TABLE documents
  ALTER COLUMN first_seen_at SET DEFAULT now(),
  ALTER COLUMN first_seen_at SET NOT NULL,
  ALTER COLUMN last_seen_at  SET DEFAULT now(),
  ALTER COLUMN last_seen_at  SET NOT NULL;

-- INSERT: both = fetched_at. UPDATE (re-crawl upsert or any other write): first_seen_at never
-- changes, last_seen_at only moves forward (a retried, older fetch cannot move it back).
CREATE OR REPLACE FUNCTION documents_track_seen() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.first_seen_at := NEW.fetched_at;
    NEW.last_seen_at  := NEW.fetched_at;
  ELSE
    NEW.first_seen_at := OLD.first_seen_at;
    NEW.last_seen_at  := greatest(OLD.last_seen_at, NEW.fetched_at);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_track_seen ON documents;
CREATE TRIGGER documents_track_seen
  BEFORE INSERT OR UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION documents_track_seen();
