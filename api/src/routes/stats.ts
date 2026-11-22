import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { FastifyPluginAsync } from "fastify";
import type { Db } from "../db/client.js";
import { documents, findings } from "../db/schema.js";
import { trendQuerySchema, type CountItem } from "../types/stats.js";

type Deps = { db: Db };

export const statsRoutes: FastifyPluginAsync<Deps> = async (app, { db }) => {
  app.get("/stats/trend", async (request) => {
    const started = Date.now();
    const query = trendQuerySchema.parse(request.query);

    // Inlined literal (not a bound param): SELECT and GROUP BY must be the identical expression.
    // Safe: query.bucket is a zod-validated enum ('day' | 'hour').
    const bucketExpr = sql<Date>`date_trunc(${sql.raw(`'${query.bucket}'`)}, ${findings.createdAt})`;
    const conditions: (SQL | undefined)[] = [
      query.module !== undefined ? eq(findings.module, query.module) : undefined,
      query.from ? gte(findings.createdAt, query.from) : undefined,
      query.to ? lte(findings.createdAt, query.to) : undefined,
    ];

    const rows = await db
      .select({ bucket: bucketExpr, module: findings.module, count: sql<number>`count(*)::int` })
      .from(findings)
      .where(and(...conditions))
      .groupBy(bucketExpr, findings.module)
      .orderBy(bucketExpr, findings.module);

    request.log.info(
      { bucket: query.bucket, module: query.module ?? null, points: rows.length, ms: Date.now() - started },
      "stats trend computed",
    );
    return {
      bucket: query.bucket,
      module: query.module ?? null,
      points: rows.map((r) => ({
        bucket: new Date(r.bucket).toISOString(),
        module: r.module,
        count: r.count,
      })),
    };
  });

  app.get("/stats/summary", async (request) => {
    const started = Date.now();
    const count = sql<number>`count(*)::int`;

    const group = async <K extends string | number>(col: PgColumn, joinDocs = false): Promise<CountItem<K>[]> => {
      const base = db.select({ key: col, count }).from(findings);
      const q = joinDocs ? base.innerJoin(documents, eq(documents.id, findings.documentId)) : base;
      const rows = await q.groupBy(col).orderBy(desc(count), col);
      return rows.map((r) => ({ key: r.key as K, count: r.count }));
    };

    const [byModule, byRisk, bySourceKind, byStatus] = await Promise.all([
      group<number>(findings.module),
      group<string>(findings.riskLevel),
      group<string>(documents.sourceKind, true),
      group<string>(findings.status),
    ]);
    const total = byModule.reduce((sum, i) => sum + i.count, 0);

    request.log.info({ total, ms: Date.now() - started }, "stats summary computed");
    return { total, byModule, byRisk, bySourceKind, byStatus };
  });
};
