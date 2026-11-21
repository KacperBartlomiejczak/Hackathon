import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import type { Config } from "./config.js";
import { createDb } from "./db/client.js";
import { buildLoggerOptions } from "./logger.js";
import { findingsRoutes } from "./routes/findings.js";
import { internalRoutes } from "./routes/internal.js";
import { statsRoutes } from "./routes/stats.js";
import { settingsRoutes } from "./routes/settings.js";
import { sourcesRoutes } from "./routes/sources.js";
import { createCrawlQueue } from "./queue/crawl.js";
import { createSocketServer } from "./realtime/socket.js";
import { createStorage } from "./storage/s3.js";

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({ logger: buildLoggerOptions(config.LOG_LEVEL) });

  const { db, pool } = createDb(config.DATABASE_URL, app.log);
  app.addHook("onClose", async () => {
    await pool.end();
  });
  const storage = createStorage(config);
  const crawlQueue = createCrawlQueue(config.VALKEY_URL, app.log);
  app.addHook("onClose", async () => {
    await crawlQueue.close();
  });

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: "bad_request",
        message: "Invalid request",
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    request.log.error({ err }, "request failed");
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ error: "bad_request", message: (err as Error).message });
    }
    return reply.code(500).send({ error: "internal", message: "Internal server error" });
  });

  await app.register(cors, { origin: config.WEB_ORIGIN });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

  app.get("/health", { config: { rateLimit: false } }, async () => ({ status: "ok" }));
  const io = createSocketServer(app, config);
  await app.register(findingsRoutes, { db, storage, io });
  await app.register(statsRoutes, { db });
  await app.register(internalRoutes, { io, internalToken: config.INTERNAL_TOKEN });
  await app.register(settingsRoutes, {
    db,
    aiUrl: config.AI_URL,
    evalTimeoutMs: config.EVAL_TIMEOUT_MS,
  });
  await app.register(sourcesRoutes, { db, crawlQueue });

  return app;
}
