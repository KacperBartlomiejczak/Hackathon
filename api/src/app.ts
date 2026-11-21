import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import type { Config } from "./config.js";
import { createDb } from "./db/client.js";
import { buildLoggerOptions } from "./logger.js";
import { exportRoutes } from "./routes/export.js";
import { findingsRoutes } from "./routes/findings.js";
import { internalRoutes } from "./routes/internal.js";
import { statsRoutes } from "./routes/stats.js";
import { settingsRoutes } from "./routes/settings.js";
import { sourcesRoutes } from "./routes/sources.js";
import { createCrawlQueue } from "./queue/crawl.js";
import { createSocketServer } from "./realtime/socket.js";
import { createStorage } from "./storage/s3.js";

/** `error` codes for 4xx responses; any other 4xx falls back to "bad_request". */
const CLIENT_ERROR_CODES: Record<number, string> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  405: "method_not_allowed",
  406: "not_acceptable",
  409: "conflict",
  413: "payload_too_large",
  415: "unsupported_media_type",
  429: "rate_limited",
};

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

  // Every error leaves as { error, message } (+ issues for 400 validation). Stack traces and
  // driver messages stay in the pino log only.
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: "bad_request",
        message: "Invalid request",
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const status = (err as { statusCode?: unknown }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      request.log.warn({ statusCode: status, code: (err as { code?: unknown }).code }, "request rejected");
      const message = (err as { message?: unknown }).message;
      return reply.code(status).send({
        error: CLIENT_ERROR_CODES[status] ?? "bad_request",
        message: typeof message === "string" && message.length > 0 ? message : "Bad request",
      });
    }
    request.log.error({ err }, "request failed");
    return reply.code(500).send({ error: "internal", message: "Internal server error" });
  });
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({ error: "not_found", message: `Route ${request.method} ${request.url.split("?")[0]} not found` }),
  );

  await app.register(cors, {
    origin: config.WEB_ORIGIN,
    // Lets the browser read the export file name and the truncation flag (web/src/lib/api.ts).
    exposedHeaders: ["Content-Disposition", "X-Export-Truncated"],
  });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

  app.get("/health", { config: { rateLimit: false } }, async () => ({ status: "ok" }));
  const io = createSocketServer(app, config);
  await app.register(findingsRoutes, { db, storage, io });
  await app.register(exportRoutes, { db });
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
