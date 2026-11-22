import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { DEFAULT_THRESHOLD, effectiveRiskLevel, HIGH_RISK_SCORE } from "../src/db/risk.js";

describe("effectiveRiskLevel SQL (#84)", () => {
  const { sql: text, params } = new PgDialect().sqlToQuery(effectiveRiskLevel);

  it("derives the level from score and the module's current threshold, not from findings.risk_level", () => {
    assert.match(text, /"findings"\."score" >= 0\.8 then 'high'/);
    assert.match(text, /select ms\."threshold" from "module_settings" ms where ms\."module" = "findings"\."module"/);
    assert.match(text, /else 'low'/);
    assert.doesNotMatch(text, /risk_level/);
  });

  it("falls back to the default threshold when a module has no settings row", () => {
    assert.match(text, /coalesce\(\(select .*\), 0\.6\)/s);
    assert.equal(HIGH_RISK_SCORE, 0.8);
    assert.equal(DEFAULT_THRESHOLD, 0.6);
  });

  it("qualifies findings columns and binds no parameters (same text in SELECT, WHERE and GROUP BY)", () => {
    assert.deepEqual(params, []);
    assert.equal((text.match(/"findings"\.("score"|"module")/g) ?? []).length, 3);
  });
});
