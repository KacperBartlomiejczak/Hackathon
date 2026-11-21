import { getTableName, sql } from "drizzle-orm";
import { crawlRuns, documents } from "./schema.js";

/**
 * How long after a successful crawl_run finishes before a document it did not touch counts as
 * gone. The collector marks the run `ok` once items are queued, not fetched (crawl-item jobs
 * retry with backoff), so without the grace every ad of a source would flicker to inactive.
 */
export const INACTIVE_GRACE = "1 hour";

/**
 * `documents.isActive` (issue #55): false when a successful crawl of the document's source
 * started after the document was last seen and finished more than INACTIVE_GRACE ago, i.e. the
 * ad was not found by a later complete crawl. Requires `documents` in the FROM clause.
 */
// Table names are written out: in a single-table select drizzle renders columns unqualified,
// and "source_id" = "source_id" would then compare crawl_runs with itself.
export const documentIsActive = sql<boolean>`not exists (
  select 1 from ${crawlRuns} cr
  where cr.source_id = ${sql.identifier(getTableName(documents))}.source_id
    and cr.status = 'ok'
    and cr.started_at > ${sql.identifier(getTableName(documents))}.last_seen_at
    and cr.finished_at < now() - ${sql.raw(`interval '${INACTIVE_GRACE}'`)}
)`;
