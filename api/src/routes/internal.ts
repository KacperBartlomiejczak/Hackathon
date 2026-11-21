import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { Io } from "../realtime/socket.js";
import { alertSchema, crawlStatusSchema } from "../types/internal.js";

type Deps = { io: Io; internalToken: string };

const sha256 = (s: string): Buffer => createHash("sha256").update(s).digest();

export const internalRoutes: FastifyPluginAsync<Deps> = async (app, { io, internalToken }) => {
  // Hash both sides so timingSafeEqual always gets equal-length buffers.
  const expected = sha256(internalToken);

  app.addHook("onRequest", async (request, reply) => {
    const header = request.headers["x-internal-token"];
    const provided = typeof header === "string" ? header : "";
    if (provided === "" || !timingSafeEqual(sha256(provided), expected)) {
      request.log.warn({ route: request.routeOptions.url }, "internal auth rejected");
      return reply.code(401).send({ error: "unauthorized" });
    }
    return undefined;
  });

  app.post("/internal/alerts", { config: { rateLimit: false } }, async (request, reply) => {
    const payload = alertSchema.parse(request.body);
    io.emit("alert:new", payload);
    request.log.info(
      { findingId: payload.findingId, documentId: payload.documentId, module: payload.module },
      "alert emitted",
    );
    return reply.code(202).send({ ok: true });
  });

  app.post("/internal/crawl-status", { config: { rateLimit: false } }, async (request, reply) => {
    const payload = crawlStatusSchema.parse(request.body);
    io.emit("crawl:status", payload);
    request.log.info(
      { crawlRunId: payload.crawlRunId, sourceId: payload.sourceId, status: payload.status },
      "crawl status emitted",
    );
    return reply.code(202).send({ ok: true });
  });
};
