import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import type { Db } from "../src/db/client.js";
import { settingsRoutes } from "../src/routes/settings.js";
import { listQuerySchema, statusBodySchema } from "../src/types/findings.js";
import { evalQuerySchema } from "../src/types/settings.js";
import { trendQuerySchema } from "../src/types/stats.js";

describe("from/to date filters", () => {
  it("a bare `to` date covers the whole day (UTC)", () => {
    const q = listQuerySchema.parse({ from: "2026-11-20", to: "2026-11-20" });
    assert.equal(q.from?.toISOString(), "2026-11-20T00:00:00.000Z");
    assert.equal(q.to?.toISOString(), "2026-11-20T23:59:59.999Z");
  });
  it("a full `to` timestamp is used as given", () => {
    const q = listQuerySchema.parse({ to: "2026-11-20T10:00:00+01:00" });
    assert.equal(q.to?.toISOString(), "2026-11-20T09:00:00.000Z");
  });
  it("/stats/trend uses the same rules", () => {
    const q = trendQuerySchema.parse({ to: "2026-11-20" });
    assert.equal(q.to?.toISOString(), "2026-11-20T23:59:59.999Z");
  });
  it("dates outside 1970–9999 are rejected (Postgres would answer 500)", () => {
    for (const v of ["-200000-01-01T00:00:00Z", "+020000-01-01T00:00:00Z", "1969-12-31T23:59:59Z"]) {
      assert.equal(listQuerySchema.safeParse({ from: v }).success, false, `from=${v}`);
      assert.equal(listQuerySchema.safeParse({ to: v }).success, false, `to=${v}`);
    }
    assert.equal(listQuerySchema.safeParse({ to: "9999-12-31" }).success, true);
  });
  it("invalid or empty dates are rejected", () => {
    for (const v of ["notadate", "", "2026-13-01"]) {
      assert.equal(listQuerySchema.safeParse({ to: v }).success, false, `to=${JSON.stringify(v)}`);
    }
  });
});

describe("NUL bytes (Postgres rejects them in text)", () => {
  it("q with NUL → invalid", () => {
    assert.equal(listQuerySchema.safeParse({ q: "a\u0000b" }).success, false);
    assert.equal(listQuerySchema.safeParse({ q: "100% zysku" }).success, true);
  });
  it("changedBy / note with NUL → invalid", () => {
    assert.equal(statusBodySchema.safeParse({ status: "in_review", changedBy: "jan\u0000" }).success, false);
    assert.equal(statusBodySchema.safeParse({ status: "in_review", note: "x\u0000" }).success, false);
    assert.equal(statusBodySchema.safeParse({ status: "in_review", changedBy: "Jan Kowalski" }).success, true);
  });
});

describe("GET /eval query", () => {
  it("empty threshold is missing, not 0", () => {
    assert.equal(evalQuerySchema.safeParse({ module: "1", threshold: "" }).success, false);
    assert.equal(evalQuerySchema.safeParse({ module: "1", threshold: "  " }).success, false);
    assert.equal(evalQuerySchema.parse({ module: "1", threshold: "0" }).threshold, 0);
  });
});

describe("GET /eval — ai drops the connection mid-body", () => {
  const ai = createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json", "content-length": "1000" });
    res.write('{"partial":');
    setTimeout(() => req.socket.destroy(), 20);
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

  it("answers 502 ai_unavailable, not 500", async () => {
    const res = await app.inject({ method: "GET", url: "/eval?module=2&threshold=0.5" });
    assert.equal(res.statusCode, 502);
    assert.deepEqual(res.json(), { error: "ai_unavailable", message: "AI service unreachable" });
  });
});
