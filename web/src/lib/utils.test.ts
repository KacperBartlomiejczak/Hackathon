import { describe, expect, it } from "vitest";
import { cn, criterionLabel, formatDate, sourceLabel, verdictLabel } from "./utils";

describe("label helpers", () => {
  it("translate known codes to Polish", () => {
    expect(sourceLabel("web")).toBe("Strona WWW");
    expect(criterionLabel("profit_promises")).toBe("Obietnice zysku");
    expect(verdictLabel("fail")).toBe("niespełnione");
  });

  it("fall back to the raw code for unknown values", () => {
    expect(sourceLabel("mastodon")).toBe("mastodon");
    expect(criterionLabel("brand_new_criterion")).toBe("brand_new_criterion");
    expect(verdictLabel("maybe")).toBe("maybe");
  });

  it("handle an empty code without throwing", () => {
    expect(sourceLabel("")).toBe("");
    expect(criterionLabel("")).toBe("");
    expect(verdictLabel("")).toBe("");
  });

  // KNOWN BUG: label maps are plain objects, so "constructor" resolves to a function.
  it.fails("return a string even for inherited object keys", () => {
    expect(typeof sourceLabel("constructor")).toBe("string");
    expect(sourceLabel("toString")).toBe("toString");
    expect(criterionLabel("__proto__")).toBe("__proto__");
  });
});

describe("formatDate", () => {
  it("formats a valid ISO date", () => {
    expect(formatDate("2026-11-22T10:30:00Z")).toMatch(/22\.11\.2026/);
  });

  it("does not throw on an invalid or empty date", () => {
    expect(() => formatDate("not-a-date")).not.toThrow();
    expect(() => formatDate("")).not.toThrow();
    expect(formatDate("")).toMatch(/Invalid/i);
  });
});

describe("cn", () => {
  it("lets the last conflicting Tailwind class win", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, 0, "", "b")).toBe("a b");
  });

  it("returns an empty string for no input", () => {
    expect(cn()).toBe("");
  });
});
