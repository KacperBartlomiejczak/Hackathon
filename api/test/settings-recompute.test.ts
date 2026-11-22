import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import type { Db } from "../src/db/client.js";
import { settingsRoutes } from "../src/routes/settings.js";

const AI_AUTH_HEADER = "investwatch-dev-internal-token";
const body = { threshold: 0.7, weights: { llm: 0.5, rules: 0.3, emb: 0.2 } };

// Just enough of drizzle's insert().values().onConflictDoUpdate().returning() chain for the PUT route.
const fakeDb = {
  insert: () => ({
    values: (v: { module: number; threshold: number; weights: unknown }) => ({
      onConflictDoUpdate: () => ({ returning: async () => [{ ...v }] }),
    }),
  }),
} as unknown as Db;

describe("PUT /settings/modules/:module → ai /recompute-risk (#84)", () => {
  let calls: IncomingMessage[] = [];
  let aiStatus = 200;
  const ai = createServer((req, res) => {
    calls.push(req);
    res.writeHead(aiStatus, { "content-type": "application/json" });
    res.end(JSON.stringify({ module: 2, threshold: 0.7, updated: 3 }));
  });
  let app: FastifyInstance;

  const register = async (aiUrl: string): Promise<FastifyInstance> => {
    const a = Fastify({ logger: false });
    await a.register(settingsRoutes, { db: fakeDb, aiUrl, internalToken: AI_AUTH_HEADER, evalTimeoutMs: 2000 });
    await a.ready();
    return a;
  };

  before(async () => {
    await new Promise<void>((resolve) => ai.listen(0, "127.0.0.1", resolve));
    app = await register(`http://127.0.0.1:${(ai.address() as AddressInfo).port}`);
  });
  beforeEach(() => {
    calls = [];
    aiStatus = 200;
  });
  after(async () => {
    await app.close();
    await new Promise<void>((resolve) => ai.close(() => resolve()));
  });

  it("calls ai with the module and the internal token, then reports recomputed: true", async () => {
    const res = await app.inject({ method: "PUT", url: "/settings/modules/2", payload: body });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { module: 2, ...body, recomputed: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.method, "POST");
    assert.equal(calls[0]?.url, "/recompute-risk?module=2");
    assert.equal(calls[0]?.headers["x-internal-token"], AI_AUTH_HEADER);
  });

  it("does not call ai when the body is invalid", async () => {
    const res = await app.inject({ method: "PUT", url: "/settings/modules/2", payload: { ...body, threshold: 2 } });
    // The Zod → 400 mapping lives in buildApp's error handler; here it is enough that the PUT fails.
    assert.ok(res.statusCode >= 400);
    assert.equal(calls.length, 0);
  });

  it("keeps the saved threshold and answers recomputed: false when ai rejects", async () => {
    aiStatus = 404;
    const res = await app.inject({ method: "PUT", url: "/settings/modules/1", payload: body });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { module: 1, ...body, recomputed: false });
  });

  it("keeps the saved threshold and answers recomputed: false when ai is unreachable", async () => {
    const down = await register("http://127.0.0.1:1");
    const res = await down.inject({ method: "PUT", url: "/settings/modules/3", payload: body });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { module: 3, ...body, recomputed: false });
    await down.close();
  });
});
