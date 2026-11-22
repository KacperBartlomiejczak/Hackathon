import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import type { Db } from "../db/client.js";
import { moduleSettings } from "../db/schema.js";
import {
  evalQuerySchema,
  moduleParamsSchema,
  settingsBodySchema,
  type ModuleSettings,
} from "../types/settings.js";

type Deps = { db: Db; aiUrl: string; internalToken: string; evalTimeoutMs: number };

export const settingsRoutes: FastifyPluginAsync<Deps> = async (app, { db, aiUrl, internalToken, evalTimeoutMs }) => {
  app.get("/settings/modules/:module", async (request, reply) => {
    const { module } = moduleParamsSchema.parse(request.params);
    const [row] = await db.select().from(moduleSettings).where(eq(moduleSettings.module, module));
    if (!row) {
      return reply.code(404).send({ error: "not_found", message: "Module settings not found" });
    }
    const result: ModuleSettings = row;
    return result;
  });

  app.put("/settings/modules/:module", async (request) => {
    const { module } = moduleParamsSchema.parse(request.params);
    const body = settingsBodySchema.parse(request.body);
    const [row] = await db
      .insert(moduleSettings)
      .values({ module, threshold: body.threshold, weights: body.weights })
      .onConflictDoUpdate({
        target: moduleSettings.module,
        set: { threshold: body.threshold, weights: body.weights },
      })
      .returning();
    request.log.info({ module, threshold: body.threshold, weights: body.weights }, "module settings saved");
    const result: ModuleSettings = row ?? { module, ...body };
    return result;
  });

  app.get("/eval", async (request, reply) => {
    const started = Date.now();
    const query = evalQuerySchema.parse(request.query);
    const url = new URL("/eval", aiUrl);
    url.searchParams.set("module", String(query.module));
    url.searchParams.set("threshold", String(query.threshold));

    let res: Response;
    try {
      // ai checks X-Internal-Token once AI_REQUIRE_TOKEN is on (issue #70).
      res = await fetch(url, {
        headers: { "X-Internal-Token": internalToken },
        signal: AbortSignal.timeout(evalTimeoutMs),
      });
    } catch (err) {
      request.log.error({ err, module: query.module, ms: Date.now() - started }, "ai eval unreachable");
      return reply.code(502).send({ error: "ai_unavailable", message: "AI service unreachable" });
    }
    const text = await res.text();
    request.log.info(
      { module: query.module, threshold: query.threshold, aiStatus: res.status, ms: Date.now() - started },
      "eval proxied",
    );
    return reply
      .code(res.status)
      .type(res.headers.get("content-type") ?? "application/json")
      .send(text);
  });
};
