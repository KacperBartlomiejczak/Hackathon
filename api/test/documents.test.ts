import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { documentIsActive } from "../src/db/seen.js";
import { aggregateModules } from "../src/routes/documents.js";

const f = (module: number, score: number, riskLevel: string, iso: string) => ({
  module,
  score,
  riskLevel,
  createdAt: new Date(iso),
});

describe("aggregateModules — M1/M2/M3 aggregator (#54)", () => {
  it("returns empty slots and null summary without findings", () => {
    const a = aggregateModules([]);
    assert.deepEqual(a.modules, { "1": null, "2": null, "3": null });
    assert.deepEqual(a.overall, {
      maxScore: null,
      riskLevel: null,
      flaggedModules: [],
      findingsCount: 0,
      lastFindingAt: null,
    });
  });

  it("puts each finding in its module slot and summarises across modules", () => {
    const m1 = f(1, 0.65, "medium", "2026-11-21T10:00:00Z");
    const m3 = f(3, 0.91, "high", "2026-11-21T12:00:00Z");
    const m2 = f(2, 0.2, "low", "2026-11-21T11:00:00Z");
    const a = aggregateModules([m3, m1, m2]);
    assert.equal(a.modules["1"], m1);
    assert.equal(a.modules["2"], m2);
    assert.equal(a.modules["3"], m3);
    assert.equal(a.overall.maxScore, 0.91);
    assert.equal(a.overall.riskLevel, "high");
    assert.deepEqual(a.overall.flaggedModules, [1, 3]);
    assert.equal(a.overall.findingsCount, 3);
    assert.equal(a.overall.lastFindingAt?.toISOString(), "2026-11-21T12:00:00.000Z");
  });

  it("ranks risk by level, not by score order", () => {
    // medium with a higher score than a (mis-scored) high must not win the risk level.
    const a = aggregateModules([f(1, 0.79, "medium", "2026-11-21T10:00:00Z"), f(2, 0.5, "high", "2026-11-21T10:00:00Z")]);
    assert.equal(a.overall.riskLevel, "high");
    assert.equal(a.overall.maxScore, 0.79);
  });

  it("keeps the higher score on a duplicate module and ignores unknown modules", () => {
    const low = f(2, 0.3, "low", "2026-11-21T10:00:00Z");
    const high = f(2, 0.85, "high", "2026-11-21T09:00:00Z");
    const a = aggregateModules([low, high, f(7, 1, "high", "2026-11-21T10:00:00Z")]);
    assert.equal(a.modules["2"], high);
    assert.equal(a.overall.findingsCount, 1);
    assert.deepEqual(a.overall.flaggedModules, [2]);
  });
});

describe("documentIsActive SQL (#55)", () => {
  it("qualifies outer documents columns even in a single-table select", () => {
    const { sql: text } = new PgDialect().sqlToQuery(documentIsActive);
    assert.match(text, /cr\.source_id = "documents"\.source_id/);
    assert.match(text, /cr\.started_at > "documents"\.last_seen_at/);
    assert.match(text, /cr\.status = 'ok'/);
    assert.match(text, /interval '1 hour'/);
  });
});
