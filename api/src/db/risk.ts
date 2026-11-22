// Effective risk level (issue #84): derived from `findings.score` and the module's *current* threshold
// in `module_settings`, so "Zapisz próg" changes the flags at once, without re-running the LLM.
// `findings.risk_level` stays as ai computed it at analysis time (and drives alerts); the API never reads it.
import { sql } from "drizzle-orm";

/** Same as `risk.high` in ai/config.yaml (contracts.md: high >= 0.8). */
export const HIGH_RISK_SCORE = 0.8;
/** `module_settings.threshold` column default; used until a module has a settings row. */
export const DEFAULT_THRESHOLD = 0.6;

// Columns and constants are written out as text on purpose: in a single-table SELECT drizzle renders
// column references unqualified, which would turn the correlated `findings.module` into the subquery's
// own `module` column, and a bound parameter would make SELECT and GROUP BY differ.
const high = sql.raw(String(HIGH_RISK_SCORE));
const fallback = sql.raw(String(DEFAULT_THRESHOLD));

/** high >= 0.8, medium >= module threshold, otherwise low. Usable in SELECT, WHERE and GROUP BY of a query on `findings`. */
export const effectiveRiskLevel = sql<string>`(case
  when "findings"."score" >= ${high} then 'high'
  when "findings"."score" >= coalesce((select ms."threshold" from "module_settings" ms where ms."module" = "findings"."module"), ${fallback}) then 'medium'
  else 'low' end)`;
