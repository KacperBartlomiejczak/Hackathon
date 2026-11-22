// Result aggregator (issue #54): merges the M1/M2/M3 findings of one document into a single
// object — the document, one slot per module and a cross-module summary (`overall`).
import { desc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import type { Db } from "../db/client.js";
import { documents, findings } from "../db/schema.js";
import { documentIsActive } from "../db/seen.js";
import type { Storage } from "../storage/s3.js";
import {
  MODULE_KEYS,
  RISK_RANK,
  type Aggregate,
  type AggregatableFinding,
  type AggregatedDocument,
  type AggregatedDocumentList,
  type DocumentSummary,
  type ModuleKey,
  type ModuleResult,
  type ModuleResultDetail,
} from "../types/documents.js";
import { idParamsSchema, listQuerySchema, type EntityRef } from "../types/findings.js";
import { advertiserEntity, buildFindingsWhere, firmEntity } from "./findings.js";

type Deps = { db: Db; storage: Storage };

const isModuleKey = (k: string): k is ModuleKey => (MODULE_KEYS as readonly string[]).includes(k);

/**
 * Pure aggregation of one document's findings. One slot per module (the schema guarantees at most
 * one finding per document and module; on a duplicate the higher score wins).
 */
export function aggregateModules<T extends AggregatableFinding>(items: readonly T[]): Aggregate<T> {
  const modules: Record<ModuleKey, T | null> = { "1": null, "2": null, "3": null };
  for (const item of items) {
    const key = String(item.module);
    if (!isModuleKey(key)) continue;
    const current = modules[key];
    if (!current || item.score > current.score) modules[key] = item;
  }
  const present = MODULE_KEYS.map((k) => modules[k]).filter((m): m is T => m !== null);

  let maxScore: number | null = null;
  let riskLevel: string | null = null;
  let lastFindingAt: Date | null = null;
  for (const m of present) {
    if (maxScore === null || m.score > maxScore) maxScore = m.score;
    if (riskLevel === null || (RISK_RANK[m.riskLevel] ?? -1) > (RISK_RANK[riskLevel] ?? -1)) {
      riskLevel = m.riskLevel;
    }
    if (lastFindingAt === null || m.createdAt > lastFindingAt) lastFindingAt = m.createdAt;
  }

  return {
    overall: {
      maxScore,
      riskLevel,
      flaggedModules: present.filter((m) => m.riskLevel !== "low").map((m) => m.module),
      findingsCount: present.length,
      lastFindingAt,
    },
    modules,
  };
}

const toRef = (id: number | null, name: string | null): EntityRef =>
  id !== null && name !== null ? { id, name } : null;

/** Finding columns shared by both endpoints (+ firm/advertiser names). */
const moduleColumns = {
  id: findings.id,
  module: findings.module,
  score: findings.score,
  riskLevel: findings.riskLevel,
  label: findings.label,
  status: findings.status,
  createdAt: findings.createdAt,
  firmId: firmEntity.id,
  firmName: firmEntity.name,
  advertiserId: advertiserEntity.id,
  advertiserName: advertiserEntity.name,
};

type ModuleRow = {
  id: number;
  module: number;
  score: number;
  riskLevel: string;
  label: string;
  status: string;
  createdAt: Date;
  firmId: number | null;
  firmName: string | null;
  advertiserId: number | null;
  advertiserName: string | null;
};

const toModuleResult = (r: ModuleRow): ModuleResult => ({
  id: r.id,
  module: r.module,
  score: r.score,
  riskLevel: r.riskLevel,
  label: r.label,
  status: r.status,
  createdAt: r.createdAt,
  firm: toRef(r.firmId, r.firmName),
  advertiser: toRef(r.advertiserId, r.advertiserName),
});

export const documentsRoutes: FastifyPluginAsync<Deps> = async (app, { db, storage }) => {
  // Documents with at least one finding matching the GET /findings filters; each item carries
  // ALL of its module results (filters pick documents, not slots). Newest finding first.
  app.get("/documents", async (request): Promise<AggregatedDocumentList> => {
    const started = Date.now();
    const query = listQuerySchema.parse(request.query);
    const where = buildFindingsWhere(query);

    const [pageRows, countRows] = await Promise.all([
      db
        .select({ documentId: findings.documentId })
        .from(findings)
        .innerJoin(documents, eq(documents.id, findings.documentId))
        .where(where)
        .groupBy(findings.documentId)
        .orderBy(desc(sql`max(${findings.createdAt})`), desc(findings.documentId))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      db
        .select({ total: sql<number>`count(distinct ${findings.documentId})::int` })
        .from(findings)
        .innerJoin(documents, eq(documents.id, findings.documentId))
        .where(where),
    ]);
    const total = countRows[0]?.total ?? 0;
    const ids = pageRows.map((r) => r.documentId);

    const rows = ids.length
      ? await db
          .select({
            ...moduleColumns,
            docId: documents.id,
            docUrl: documents.url,
            docTitle: documents.title,
            docSourceKind: documents.sourceKind,
            docAuthorHandle: documents.authorHandle,
            docFirstSeenAt: documents.firstSeenAt,
            docLastSeenAt: documents.lastSeenAt,
            docIsActive: documentIsActive,
          })
          .from(findings)
          .innerJoin(documents, eq(documents.id, findings.documentId))
          .leftJoin(firmEntity, eq(firmEntity.id, findings.firmEntityId))
          .leftJoin(advertiserEntity, eq(advertiserEntity.id, findings.advertiserEntityId))
          .where(inArray(findings.documentId, ids))
      : [];

    const byDoc = new Map<number, { document: DocumentSummary; results: ModuleResult[] }>();
    for (const r of rows) {
      let entry = byDoc.get(r.docId);
      if (!entry) {
        entry = {
          document: {
            id: r.docId,
            url: r.docUrl,
            title: r.docTitle,
            sourceKind: r.docSourceKind,
            authorHandle: r.docAuthorHandle,
            firstSeenAt: r.docFirstSeenAt,
            lastSeenAt: r.docLastSeenAt,
            isActive: r.docIsActive,
          },
          results: [],
        };
        byDoc.set(r.docId, entry);
      }
      entry.results.push(toModuleResult(r));
    }

    const items: AggregatedDocument[] = [];
    for (const id of ids) {
      const entry = byDoc.get(id);
      if (entry) items.push({ document: entry.document, ...aggregateModules(entry.results) });
    }

    request.log.info(
      { page: query.page, pageSize: query.pageSize, returned: items.length, total, ms: Date.now() - started },
      "documents aggregated",
    );
    return { items, page: query.page, pageSize: query.pageSize, total };
  });

  app.get("/documents/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);

    const [doc] = await db
      .select({
        id: documents.id,
        url: documents.url,
        sourceId: documents.sourceId,
        sourceKind: documents.sourceKind,
        fetchedAt: documents.fetchedAt,
        firstSeenAt: documents.firstSeenAt,
        lastSeenAt: documents.lastSeenAt,
        isActive: documentIsActive,
        publishedAt: documents.publishedAt,
        authorHandle: documents.authorHandle,
        title: documents.title,
        textClean: documents.textClean,
        screenshotKey: documents.screenshotKey,
        status: documents.status,
      })
      .from(documents)
      .where(eq(documents.id, id));
    if (!doc) {
      return reply.code(404).send({ error: "not_found", message: "Document not found" });
    }

    const rows = await db
      .select({
        ...moduleColumns,
        reasons: findings.reasons,
        model: findings.model,
        promptVersion: findings.promptVersion,
      })
      .from(findings)
      .leftJoin(firmEntity, eq(firmEntity.id, findings.firmEntityId))
      .leftJoin(advertiserEntity, eq(advertiserEntity.id, findings.advertiserEntityId))
      .where(eq(findings.documentId, id));

    const results: ModuleResultDetail[] = rows.map((r) => ({
      ...toModuleResult(r),
      reasons: r.reasons,
      model: r.model,
      promptVersion: r.promptVersion,
    }));

    let screenshotUrl: string | null = null;
    const { screenshotKey, ...document } = doc;
    if (screenshotKey) {
      try {
        screenshotUrl = await storage.presignGet(screenshotKey);
      } catch (err) {
        request.log.warn({ err, documentId: id }, "screenshot presign failed");
      }
    }

    const aggregate = aggregateModules(results);
    request.log.info(
      { documentId: id, findings: aggregate.overall.findingsCount, riskLevel: aggregate.overall.riskLevel },
      "document aggregated",
    );
    return { document: { ...document, screenshotUrl }, ...aggregate };
  });
};
