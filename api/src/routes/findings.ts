import { and, asc, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyPluginAsync } from "fastify";
import type { Db } from "../db/client.js";
import { documents, entities, findings, findingStatusHistory } from "../db/schema.js";
import type { Storage } from "../storage/s3.js";
import {
  idParamsSchema,
  listQuerySchema,
  type EntityRef,
  type FindingList,
} from "../types/findings.js";

type Deps = { db: Db; storage: Storage };

const firmEntity = alias(entities, "firm_entity");
const advertiserEntity = alias(entities, "advertiser_entity");

const toRef = (id: number | null, name: string | null): EntityRef =>
  id !== null && name !== null ? { id, name } : null;

const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export const findingsRoutes: FastifyPluginAsync<Deps> = async (app, { db, storage }) => {
  app.get("/findings", async (request): Promise<FindingList> => {
    const started = Date.now();
    const query = listQuerySchema.parse(request.query);

    const conditions: (SQL | undefined)[] = [
      query.module !== undefined ? eq(findings.module, query.module) : undefined,
      query.risk ? eq(findings.riskLevel, query.risk) : undefined,
      query.status ? eq(findings.status, query.status) : undefined,
      query.source ? eq(documents.sourceKind, query.source) : undefined,
      query.from ? gte(findings.createdAt, query.from) : undefined,
      query.to ? lte(findings.createdAt, query.to) : undefined,
    ];
    if (query.q) {
      const pattern = `%${escapeLike(query.q)}%`;
      conditions.push(or(ilike(documents.title, pattern), ilike(documents.textClean, pattern)));
    }
    const where = and(...conditions);

    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: findings.id,
          module: findings.module,
          score: findings.score,
          riskLevel: findings.riskLevel,
          label: findings.label,
          status: findings.status,
          createdAt: findings.createdAt,
          docId: documents.id,
          docUrl: documents.url,
          docTitle: documents.title,
          docSourceKind: documents.sourceKind,
          firmId: firmEntity.id,
          firmName: firmEntity.name,
          advertiserId: advertiserEntity.id,
          advertiserName: advertiserEntity.name,
        })
        .from(findings)
        .innerJoin(documents, eq(documents.id, findings.documentId))
        .leftJoin(firmEntity, eq(firmEntity.id, findings.firmEntityId))
        .leftJoin(advertiserEntity, eq(advertiserEntity.id, findings.advertiserEntityId))
        .where(where)
        .orderBy(desc(findings.createdAt), desc(findings.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(findings)
        .innerJoin(documents, eq(documents.id, findings.documentId))
        .where(where),
    ]);

    const total = countRows[0]?.total ?? 0;
    request.log.info(
      { page: query.page, pageSize: query.pageSize, returned: rows.length, total, ms: Date.now() - started },
      "findings listed",
    );

    return {
      items: rows.map((r) => ({
        id: r.id,
        module: r.module,
        score: r.score,
        riskLevel: r.riskLevel,
        label: r.label,
        status: r.status,
        createdAt: r.createdAt,
        document: { id: r.docId, url: r.docUrl, title: r.docTitle, sourceKind: r.docSourceKind },
        firm: toRef(r.firmId, r.firmName),
        advertiser: toRef(r.advertiserId, r.advertiserName),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  });

  app.get("/findings/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);

    const [row] = await db
      .select({
        finding: findings,
        document: {
          id: documents.id,
          url: documents.url,
          sourceId: documents.sourceId,
          sourceKind: documents.sourceKind,
          fetchedAt: documents.fetchedAt,
          publishedAt: documents.publishedAt,
          authorHandle: documents.authorHandle,
          title: documents.title,
          textClean: documents.textClean,
          screenshotKey: documents.screenshotKey,
          status: documents.status,
        },
        firm: firmEntity,
        advertiser: advertiserEntity,
      })
      .from(findings)
      .innerJoin(documents, eq(documents.id, findings.documentId))
      .leftJoin(firmEntity, eq(firmEntity.id, findings.firmEntityId))
      .leftJoin(advertiserEntity, eq(advertiserEntity.id, findings.advertiserEntityId))
      .where(eq(findings.id, id));

    if (!row) {
      return reply.code(404).send({ error: "not_found", message: "Finding not found" });
    }

    const history = await db
      .select()
      .from(findingStatusHistory)
      .where(eq(findingStatusHistory.findingId, id))
      .orderBy(asc(findingStatusHistory.changedAt), asc(findingStatusHistory.id));

    let screenshotUrl: string | null = null;
    const { screenshotKey, ...document } = row.document;
    if (screenshotKey) {
      try {
        screenshotUrl = await storage.presignGet(screenshotKey);
      } catch (err) {
        request.log.warn({ err, findingId: id }, "screenshot presign failed");
      }
    }

    request.log.info({ findingId: id, documentId: document.id }, "finding fetched");

    return {
      ...row.finding,
      document,
      firm: row.firm,
      advertiser: row.advertiser,
      screenshotUrl,
      statusHistory: history,
    };
  });
};
