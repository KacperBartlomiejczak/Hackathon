import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { adminAuthHook, bearerToken } from "../src/auth.js";
import { loadConfig } from "../src/config.js";
import type { Db } from "../src/db/client.js";
import { settingsRoutes } from "../src/routes/settings.js";

// Random per run: no fixed token value in the repo.
const ADMIN_BEARER = randomBytes(16).toString("hex");

async function buildTestApp(adminToken: string | undefined): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.addHook("preHandler", adminAuthHook(adminToken));
  app.get("/findings", async () => ({ ok: true }));
  app.put("/settings/modules/:module", async () => ({ ok: true }));
  app.patch("/findings/:id/status", async () => ({ ok: true }));
  app.post("/sources/:id/run", async (_req, reply) => reply.code(202).send({ ok: true }));
  app.post("/internal/alerts", async (_req, reply) => reply.code(202).send({ ok: true }));
  await app.ready();
  return app;
}

describe("bearerToken", () => {
  it("reads the Bearer token, case-insensitive scheme", () => {
    assert.equal(bearerToken(`Bearer ${ADMIN_BEARER}`), ADMIN_BEARER);
    assert.equal(bearerToken(`bearer ${ADMIN_BEARER}`), ADMIN_BEARER);
  });
  it("returns empty for missing header or other scheme", () => {
    assert.equal(bearerToken(undefined), "");
    assert.equal(bearerToken(`Basic ${ADMIN_BEARER}`), "");
    assert.equal(bearerToken("Bearer"), "");
    assert.equal(bearerToken(ADMIN_BEARER), "");
  });
});

describe("adminAuthHook — ADMIN_TOKEN set (#71)", () => {
  let app: FastifyInstance;
  before(async () => {
    app = await buildTestApp(ADMIN_BEARER);
  });
  after(async () => {
    await app.close();
  });

  const writes = [
    { method: "PUT", url: "/settings/modules/2" },
    { method: "PATCH", url: "/findings/1/status" },
    { method: "POST", url: "/sources/1/run" },
  ] as const;

  for (const w of writes) {
    it(`${w.method} ${w.url} without token → 401`, async () => {
      const res = await app.inject({ method: w.method, url: w.url });
      assert.equal(res.statusCode, 401);
      assert.deepEqual(res.json(), { error: "unauthorized", message: "Missing or invalid admin token" });
    });
    it(`${w.method} ${w.url} with wrong token → 401`, async () => {
      const res = await app.inject({ method: w.method, url: w.url, headers: { authorization: "Bearer wrong-token" } });
      assert.equal(res.statusCode, 401);
    });
    it(`${w.method} ${w.url} with token in another scheme → 401`, async () => {
      const res = await app.inject({ method: w.method, url: w.url, headers: { authorization: `Basic ${ADMIN_BEARER}` } });
      assert.equal(res.statusCode, 401);
    });
    it(`${w.method} ${w.url} with correct token → passes`, async () => {
      const res = await app.inject({ method: w.method, url: w.url, headers: { authorization: `Bearer ${ADMIN_BEARER}` } });
      assert.ok(res.statusCode < 300, String(res.statusCode));
    });
  }

  it("GET without token still works", async () => {
    const res = await app.inject({ method: "GET", url: "/findings" });
    assert.equal(res.statusCode, 200);
  });

  it("/internal/* is left to X-Internal-Token", async () => {
    const res = await app.inject({ method: "POST", url: "/internal/alerts" });
    assert.equal(res.statusCode, 202);
  });

  it("unknown route keeps its 404", async () => {
    const res = await app.inject({ method: "POST", url: "/nope" });
    assert.equal(res.statusCode, 404);
  });
});

describe("adminAuthHook — ADMIN_TOKEN unset", () => {
  it("writes stay open, as before", async () => {
    const app = await buildTestApp(undefined);
    const res = await app.inject({ method: "PUT", url: "/settings/modules/2" });
    assert.equal(res.statusCode, 200);
    await app.close();
  });
});

describe("adminAuthHook — runs after the rate limit", () => {
  it("wrong tokens are counted and end in 429", async () => {
    const app = Fastify({ logger: false });
    await app.register(rateLimit, { max: 3, timeWindow: "1 minute" });
    app.addHook("preHandler", adminAuthHook(ADMIN_BEARER));
    app.put("/settings/modules/:module", async () => ({ ok: true }));
    await app.ready();
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: "PUT",
        url: "/settings/modules/2",
        headers: { authorization: "Bearer wrong-token" },
      });
      codes.push(res.statusCode);
    }
    assert.deepEqual(codes, [401, 401, 401, 429, 429]);
    await app.close();
  });
});

describe("config ADMIN_TOKEN", () => {
  const base = {
    INTERNAL_TOKEN: "investwatch-dev-internal-token",
    DATABASE_URL: "postgres://u:p@localhost:5432/db",
    S3_ENDPOINT: "http://localhost:8333",
    S3_ACCESS_KEY: "a",
    S3_SECRET_KEY: "b",
    S3_BUCKET: "c",
  };
  it("empty or unset means disabled", () => {
    assert.equal(loadConfig(base).ADMIN_TOKEN, undefined);
    assert.equal(loadConfig({ ...base, ADMIN_TOKEN: "  " }).ADMIN_TOKEN, undefined);
  });
  it("set token is kept, too short is rejected", () => {
    assert.equal(loadConfig({ ...base, ADMIN_TOKEN: ADMIN_BEARER }).ADMIN_TOKEN, ADMIN_BEARER);
    assert.throws(() => loadConfig({ ...base, ADMIN_TOKEN: "short" }));
  });
});

describe("GET /eval proxy sends X-Internal-Token (#70)", () => {
  let seen: IncomingHttpHeaders | undefined;
  const ai = createServer((req, res) => {
    seen = req.headers;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ precision: 1 }));
  });
  let app: FastifyInstance;

  before(async () => {
    await new Promise<void>((resolve) => ai.listen(0, "127.0.0.1", resolve));
    const { port } = ai.address() as AddressInfo;
    app = Fastify({ logger: false });
    await app.register(settingsRoutes, {
      db: {} as Db,
      aiUrl: `http://127.0.0.1:${port}`,
      internalToken: "investwatch-dev-internal-token",
      evalTimeoutMs: 5000,
    });
    await app.ready();
  });
  after(async () => {
    await app.close();
    await new Promise<void>((resolve) => ai.close(() => resolve()));
  });

  it("forwards the internal token header to ai", async () => {
    const res = await app.inject({ method: "GET", url: "/eval?module=2&threshold=0.5" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { precision: 1 });
    assert.equal(seen?.["x-internal-token"], "investwatch-dev-internal-token");
  });
});
