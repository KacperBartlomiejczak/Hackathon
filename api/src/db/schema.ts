// Mirrors infra/db/001_init.sql (DDL source of truth). Used for queries only.
// Columns are declared in camelCase; drizzle({ casing: "snake_case" }) maps them to DB names.
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  smallint,
  text,
  timestamp,
  unique,
  vector,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const tz = { withTimezone: true } as const;

export const sources = pgTable(
  "sources",
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
      "sources_kind_check",
      sql`${t.kind} IN ('web','facebook','instagram','tiktok','youtube','sample')`,
    ),
  ],
);

export const crawlRuns = pgTable(
  "crawl_runs",
  {
    id: serial().primaryKey(),
    sourceId: integer().references(() => sources.id),
    startedAt: timestamp(tz).notNull().defaultNow(),
    finishedAt: timestamp(tz),
    status: text().notNull().default("running"),
    itemsFound: integer().default(0),
    error: text(),
  },
  (t) => [
    check("crawl_runs_status_check", sql`${t.status} IN ('running','ok','partial','failed')`),
    index("crawl_runs_source_started_idx").on(t.sourceId, t.startedAt.desc()),
  ],
);

export const entities = pgTable(
  "entities",
  {
    id: serial().primaryKey(),
    name: text().notNull(),
    aliases: text().array().default(sql`'{}'`),
    type: text().notNull(),
    isAuthorized: boolean().notNull().default(false),
    registerRef: text(),
    nip: text(),
    officialDomains: text().array().default(sql`'{}'`),
    socialHandles: text().array().default(sql`'{}'`),
  },
  (t) => [
    check(
      "entities_type_check",
      sql`${t.type} IN ('investment_firm','foreign_firm','advertiser','finfluencer','advisory_unlicensed','unknown')`,
    ),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
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
    // Signed 64-bit. bigint mode: never selected by the API (JSON cannot carry bigint).
    simhash: bigint({ mode: "bigint" }),
    duplicateOf: bigint({ mode: "number" }).references((): AnyPgColumn => documents.id),
    embedding: vector({ dimensions: 1024 }),
    status: text().notNull().default("fetched"),
  },
  (t) => [
    check(
      "documents_status_check",
      sql`${t.status} IN ('fetched','processed','duplicate','failed')`,
    ),
    index("documents_source_kind_fetched_idx").on(t.sourceKind, t.fetchedAt),
    index("documents_source_id_idx").on(t.sourceId),
    index("documents_crawl_run_id_idx").on(t.crawlRunId),
    index("documents_content_hash_idx").on(t.contentHash),
  ],
);

export type Reason = { criterion: string; verdict: string; quote: string; weight: number };

export const findings = pgTable(
  "findings",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    documentId: bigint({ mode: "number" })
      .notNull()
      .references(() => documents.id),
    module: smallint().notNull(),
    score: real().notNull(),
    riskLevel: text().notNull(),
    label: text().notNull(),
    reasons: jsonb().$type<Reason[]>().notNull(),
    firmEntityId: integer().references(() => entities.id),
    advertiserEntityId: integer().references(() => entities.id),
    model: text().notNull(),
    promptVersion: text().notNull(),
    status: text().notNull().default("new"),
    createdAt: timestamp(tz).notNull().defaultNow(),
  },
  (t) => [
    unique("findings_document_id_module_key").on(t.documentId, t.module),
    check("findings_module_check", sql`${t.module} IN (1,2,3)`),
    check("findings_score_check", sql`${t.score} BETWEEN 0 AND 1`),
    check("findings_risk_level_check", sql`${t.riskLevel} IN ('low','medium','high')`),
    check("findings_status_check", sql`${t.status} IN ('new','in_review','confirmed','dismissed')`),
    index("findings_filter_idx").on(t.module, t.riskLevel, t.status, t.createdAt.desc()),
    index("findings_document_id_idx").on(t.documentId),
    index("findings_firm_entity_id_idx").on(t.firmEntityId),
    index("findings_advertiser_entity_id_idx").on(t.advertiserEntityId),
  ],
);

export const findingStatusHistory = pgTable(
  "finding_status_history",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    findingId: bigint({ mode: "number" })
      .notNull()
      .references(() => findings.id),
    oldStatus: text(),
    newStatus: text(),
    changedBy: text(),
    changedAt: timestamp(tz).notNull().defaultNow(),
  },
  (t) => [index("finding_status_history_finding_idx").on(t.findingId, t.changedAt)],
);

export const moduleSettings = pgTable(
  "module_settings",
  {
    module: smallint().primaryKey(),
    threshold: real().notNull().default(0.6),
    weights: jsonb()
      .$type<{ llm: number; rules: number; emb: number }>()
      .notNull()
      .default(sql`'{"llm":0.6,"rules":0.25,"emb":0.15}'::jsonb`),
  },
  (t) => [
    check("module_settings_module_check", sql`${t.module} IN (1,2,3)`),
    check("module_settings_threshold_check", sql`${t.threshold} >= 0 AND ${t.threshold} <= 1`),
  ],
);
