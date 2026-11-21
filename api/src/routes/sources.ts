import { asc, eq, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import type { Db } from "../db/client.js";
import { sources } from "../db/schema.js";
import type { CrawlQueue } from "../queue/crawl.js";
import { sourceIdParamsSchema, type LastRun, type SourceItem } from "../types/sources.js";

type Deps = { db: Db; crawlQueue: CrawlQueue };

type LastRunRow = {
  id: number;
  status: string;
  started_at: string;
  finished_at: string | null;
  items_found: number | null;
  error: string | null;
};

const toIso = (v: string | null): string | null => (v === null ? null : new Date(v).toISOString());

export const sourcesRoutes: FastifyPluginAsync<Deps> = async (app, { db, crawlQueue }) => {
  app.get("/sources", async (request) => {
    const started = Date.now();
    // Correlated subquery picks the newest crawl_run per source (index crawl_runs_source_started_idx).
    // Outer column is written fully qualified on purpose: drizzle renders ${sources.id} as a bare
    // "id" here, which Postgres would resolve to cr.id inside the subquery.
    const rows = await db
      .select({
        id: sources.id,
        kind: sources.kind,
        name: sources.name,
        startUrl: sources.startUrl,
        moduleHint: sources.moduleHint,
        enabled: sources.enabled,
        cron: sources.cron,
        lastRun: sql<LastRunRow | null>`(
          SELECT row_to_json(r) FROM (
            SELECT cr.id, cr.status, cr.started_at, cr.finished_at, cr.items_found, cr.error
            FROM crawl_runs cr
            WHERE cr.source_id = "sources"."id"
            ORDER BY cr.started_at DESC, cr.id DESC
            LIMIT 1
          ) r
        )`,
      })
      .from(sources)
      .orderBy(asc(sources.id));

    const items: SourceItem[] = rows.map((r) => {
      const run = r.lastRun;
      const lastRun: LastRun = run
        ? {
            id: run.id,
            status: run.status,
            startedAt: toIso(run.started_at) ?? "",
            finishedAt: toIso(run.finished_at),
            itemsFound: run.items_found,
            error: run.error,
          }
        : null;
      return { ...r, lastRun };
    });
    request.log.info({ count: items.length, ms: Date.now() - started }, "sources listed");
    return items;
  });

  app.post("/sources/:id/run", async (request, reply) => {
    const { id } = sourceIdParamsSchema.parse(request.params);
    const [source] = await db
      .select({ id: sources.id, enabled: sources.enabled })
      .from(sources)
      .where(eq(sources.id, id));
    if (!source) {
      return reply.code(404).send({ error: "not_found", message: "Source not found" });
    }

    let jobId: string;
    try {
      jobId = await crawlQueue.enqueue({ sourceId: id, trigger: "manual" });
    } catch (err) {
      request.log.error({ err, sourceId: id }, "crawl enqueue failed");
      return reply.code(503).send({ error: "queue_unavailable", message: "Queue unavailable" });
    }
    request.log.info({ sourceId: id, jobId, enabled: source.enabled }, "manual crawl enqueued");
    return reply.code(202).send({ ok: true, jobId, sourceId: id });
  });
};
