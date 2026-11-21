import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { Config } from "./config.js";
import { buildLoggerOptions } from "./logger.js";

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({ logger: buildLoggerOptions(config.LOG_LEVEL) });

  await app.register(cors, { origin: config.WEB_ORIGIN });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

  app.get("/health", { config: { rateLimit: false } }, async () => ({ status: "ok" }));

  return app;
}
