// Mirrors infra/db/001_init.sql (DDL source of truth). Collector subset: sources, crawl_runs, documents.
// Columns are declared in camelCase; drizzle({ casing: 'snake_case' }) maps them to DB names.
import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  vector,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

const tz = { withTimezone: true } as const;

export const sources = pgTable(
  'sources',
  {
    id: serial().primaryKey(),
    kind: text().notNull(),
    name: text().notNull(),
    startUrl: text(),
    moduleHint: smallint(),
    enabled: boolean().notNull().default(true),
    cron: text(),
  },
  (t) => [
    check(
      'sources_kind_check',
      sql`${t.kind} IN ('web','facebook','instagram','tiktok','youtube','sample')`,
    ),
  ],
);

export const crawlRuns = pgTable(
  'crawl_runs',
  {
    id: serial().primaryKey(),
    sourceId: integer().references(() => sources.id),
    startedAt: timestamp(tz).notNull().defaultNow(),
    finishedAt: timestamp(tz),
    status: text().notNull().default('running'),
    itemsFound: integer().default(0),
    error: text(),
  },
  (t) => [
    check('crawl_runs_status_check', sql`${t.status} IN ('running','ok','partial','failed')`),
    index('crawl_runs_source_started_idx').on(t.sourceId, t.startedAt.desc()),
  ],
);

export const documents = pgTable(
  'documents',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    url: text().notNull(),
    urlHash: text().notNull().unique(),
    sourceId: integer().references(() => sources.id),
    crawlRunId: integer().references(() => crawlRuns.id),
    sourceKind: text().notNull(),
    fetchedAt: timestamp(tz).notNull().defaultNow(),
    publishedAt: timestamp(tz),
    authorHandle: text(),
    title: text(),
    htmlKey: text(),
    screenshotKey: text(),
    textClean: text(),
    contentHash: text(),
    // Signed 64-bit, same as api's mirror.
    simhash: bigint({ mode: 'bigint' }),
    duplicateOf: bigint({ mode: 'number' }).references((): AnyPgColumn => documents.id),
    embedding: vector({ dimensions: 1024 }),
    status: text().notNull().default('fetched'),
  },
  (t) => [
    check(
      'documents_status_check',
      sql`${t.status} IN ('fetched','processed','duplicate','failed')`,
    ),
    index('documents_source_kind_fetched_idx').on(t.sourceKind, t.fetchedAt),
    index('documents_source_id_idx').on(t.sourceId),
    index('documents_crawl_run_id_idx').on(t.crawlRunId),
    index('documents_content_hash_idx').on(t.contentHash),
  ],
);
