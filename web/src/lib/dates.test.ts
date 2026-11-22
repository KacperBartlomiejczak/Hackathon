import { describe, expect, it } from "vitest";
import { filterQueryValue, localDayEndIso, localDayStartIso, toLocalDay } from "./dates";

// Pin the zone so the assertions hold on any machine (Node reads TZ at runtime).
(globalThis as unknown as { process: { env: Record<string, string> } }).process.env.TZ = "Europe/Warsaw";

describe("local day helpers (Europe/Warsaw)", () => {
  it("counts 23:30 UTC as the next local day in winter", () => {
    expect(toLocalDay("2026-11-20T23:30:00Z")).toBe("2026-11-21");
  });

  it("counts 22:30 UTC as the next local day in summer", () => {
    expect(toLocalDay("2026-07-20T22:30:00Z")).toBe("2026-07-21");
  });

  it("turns a local day into UTC boundaries", () => {
    expect(localDayStartIso("2026-11-21")).toBe("2026-11-20T23:00:00.000Z");
    expect(localDayEndIso("2026-11-21")).toBe("2026-11-21T22:59:59.999Z");
  });

  it("converts only from/to filter values", () => {
    expect(filterQueryValue("from", "2026-11-21")).toBe("2026-11-20T23:00:00.000Z");
    expect(filterQueryValue("to", "2026-11-21")).toBe("2026-11-21T22:59:59.999Z");
    expect(filterQueryValue("q", "forex")).toBe("forex");
    expect(filterQueryValue("module", 2)).toBe("2");
  });
});
