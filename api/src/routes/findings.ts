import { and, asc, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyPluginAsync } from "fastify";
import type { Db } from "../db/client.js";
import { documents, entities, findings, findingStatusHistory } from "../db/schema.js";
import { effectiveRiskLevel } from "../db/risk.js";
import { documentIsActive } from "../db/seen.js";
import type { Io } from "../realtime/socket.js";
import type { Storage } from "../storage/s3.js";
import {
  idParamsSchema,
  listQuerySchema,
  statusBodySchema,
  STATUS_TRANSITIONS,
  type FindingUpdatedPayload,
  type EntityRef,
  type FindingList,
  type FindingsFilter,
} from "../types/findings.js";

type Deps = { db: Db; storage: Storage; io: Io };

export const firmEntity = alias(entities, "firm_entity");
export const advertiserEntity = alias(entities, "advertiser_entity");

const toRef = (id: number | null, name: string | null): EntityRef =>
  id !== null && name !== null ? { id, name } : null;

const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Filter conditions shared by GET /findings and GET /export. Requires a join on `documents`. */
export function buildFindingsWhere(query: FindingsFilter): SQL | undefined {
  const conditions: (SQL | undefined)[] = [
    query.module !== undefined ? eq(findings.module, query.module) : undefined,
    query.risk ? sql`${effectiveRiskLevel} = ${query.risk}` : undefined,
    query.status ? eq(findings.status, query.status) : undefined,
    query.source ? eq(documents.sourceKind, query.source) : undefined,
    query.from ? gte(findings.createdAt, query.from) : undefined,
    query.to ? lte(findings.createdAt, query.to) : undefined,
  ];
  if (query.q) {
    const pattern = `%${escapeLike(query.q)}%`;
    conditions.push(or(ilike(documents.title, pattern), ilike(documents.textClean, pattern)));
  }
  return and(...conditions);
}

export const findingsRoutes: FastifyPluginAsync<Deps> = async (app, { db, storage, io }) => {
  app.patch("/findings/:id/status", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = statusBodySchema.parse(request.body);
    const changedBy = body.changedBy ?? null;

    const result = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ status: findings.status, module: findings.module, riskLevel: effectiveRiskLevel })
        .from(findings)
        .where(eq(findings.id, id))
        .for("update");
      if (!current) return { kind: "not_found" as const };
      if (!(STATUS_TRANSITIONS[current.status] ?? []).includes(body.status)) {
        return { kind: "invalid" as const, from: current.status };
      }
      await tx.update(findings).set({ status: body.status }).where(eq(findings.id, id));
      const [hist] = await tx
        .insert(findingStatusHistory)
        .values({ findingId: id, oldStatus: current.status, newStatus: body.status, changedBy })
        .returning({ changedAt: findingStatusHistory.changedAt });
      return {
        kind: "ok" as const,
        current,
        changedAt: (hist?.changedAt ?? new Date()).toISOString(),
      };
    });

    if (result.kind === "not_found") {
      return reply.code(404).send({ error: "not_found", message: "Finding not found" });
    }
    if (result.kind === "invalid") {
      request.log.warn({ findingId: id, from: result.from, to: body.status }, "status transition rejected");
      return reply.code(409).send({
        error: "invalid_transition",
        message: `Cannot change status from ${result.from} to ${body.status}`,
      });
    }

    const payload: FindingUpdatedPayload = {
      id,
      module: result.current.module,
      riskLevel: result.current.riskLevel,
      oldStatus: result.current.status,
      status: body.status,
      changedBy,
      changedAt: result.changedAt,
    };
    io.emit("finding:updated", payload);
    request.log.info(
      { findingId: id, from: payload.oldStatus, to: payload.status, changedBy, note: body.note },
      "finding status updated",
    );
    return { id, status: payload.status, oldStatus: payload.oldStatus, changedAt: payload.changedAt };
  });

  app.get("/findings", async (request): Promise<FindingList> => {
    const started = Date.now();
    const query = listQuerySchema.parse(request.query);
    const where = buildFindingsWhere(query);

    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: findings.id,
          module: findings.module,
          score: findings.score,
          riskLevel: effectiveRiskLevel,
          label: findings.label,
          status: findings.status,
          createdAt: findings.createdAt,
          docId: documents.id,
          docUrl: documents.url,
          docTitle: documents.title,
          docSourceKind: documents.sourceKind,
          docFirstSeenAt: documents.firstSeenAt,
          docLastSeenAt: documents.lastSeenAt,
          docIsActive: documentIsActive,
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
        document: {
          id: r.docId,
          url: r.docUrl,
          title: r.docTitle,
          sourceKind: r.docSourceKind,
          firstSeenAt: r.docFirstSeenAt,
          lastSeenAt: r.docLastSeenAt,
          isActive: r.docIsActive,
        },
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
        riskLevel: effectiveRiskLevel,
        document: {
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
      riskLevel: row.riskLevel,
      document,
      firm: row.firm,
      advertiser: row.advertiser,
      screenshotUrl,
      statusHistory: history,
    };
  });
};
