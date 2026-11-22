import { describe, expect, it } from "vitest";
import type { Finding } from "@/types";
import { defaultExportFilename, findingsToCsv, findingsToJson } from "./exportFormat";

function makeFinding(quote: string, label = "Test"): Finding {
  return {
    id: 1,
    documentId: 1,
    module: 1,
    score: 0.5,
    riskLevel: "high",
    label,
    reasons: [{ criterion: "c", verdict: "v", quote, weight: 1 }],
    firmEntityId: null,
    advertiserEntityId: null,
    model: "test",
    promptVersion: "v1",
    status: "new",
    createdAt: "2026-11-22T10:00:00Z",
    document: {
      id: 1,
      url: "https://example.pl/a",
      sourceKind: "web",
      fetchedAt: "2026-11-22T10:00:00Z",
      publishedAt: null,
      authorHandle: null,
      title: null,
      screenshotUrl: null,
      textClean: null,
    },
  };
}

// Fixtures here contain no embedded separators, so a plain split is enough.
function dataRow(csv: string): string[] {
  return csv.replace(/^﻿/, "").split("\r\n")[1].split(";");
}

describe("findingsToCsv", () => {
  it("quotes values with separator, quote and newline", () => {
    const csv = findingsToCsv([makeFinding('on powiedział "super"; wow\ndruga linia')]);
    expect(csv).toContain('"on powiedział ""super""; wow\ndruga linia"');
  });

  it("returns only the header row for an empty list", () => {
    const lines = findingsToCsv([]).split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Data;Moduł;Ryzyko");
  });

  it("neutralises spreadsheet formulas in text fields", () => {
    expect(findingsToCsv([makeFinding("x", "=SUM(A1)")])).toContain(";'=SUM(A1);");
  });

  it("starts with a BOM and ends with CRLF", () => {
    const csv = findingsToCsv([makeFinding("x")]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("renders missing firm and advertiser as empty fields", () => {
    const row = dataRow(findingsToCsv([makeFinding("x")]));
    expect(row[7]).toBe("");
    expect(row[8]).toBe("");
  });

  it("renders firm and advertiser names when present", () => {
    const f = makeFinding("x");
    f.firm = { id: 1, name: "Alfa Invest S.A.", type: "investment_firm", isAuthorized: true };
    f.advertiser = { id: 2, name: "@jacek", type: "finfluencer", isAuthorized: false };
    const row = dataRow(findingsToCsv([f]));
    expect(row[7]).toBe("Alfa Invest S.A.");
    expect(row[8]).toBe("@jacek");
  });

  it("uses a decimal comma for the score", () => {
    expect(dataRow(findingsToCsv([makeFinding("x")]))[3]).toBe("0,5");
  });

  it("does not prefix negative numbers as formulas", () => {
    const f = makeFinding("x");
    f.score = -0.25;
    expect(dataRow(findingsToCsv([f]))[3]).toBe("-0,25");
  });

  it.each(["+1+1", "-2+3", "@cmd(1)", "\tcmd"])("neutralises a leading formula character in %j", (value) => {
    expect(findingsToCsv([makeFinding("x", value)])).toContain(`;'${value};`);
  });

  it("neutralises and quotes a value that starts with a carriage return", () => {
    expect(findingsToCsv([makeFinding("x", "\rcmd")])).toContain(`;"'\rcmd";`);
  });

  it("still neutralises an @ value that looks like a formula", () => {
    expect(findingsToCsv([makeFinding("x", "@SUM(A1)")])).toContain(";'@SUM(A1);");
  });

  it("does not neutralise a formula character in the middle of a value", () => {
    expect(findingsToCsv([makeFinding("x", "a=b")])).toContain(";a=b;");
  });

  it("handles empty quotes and no reasons", () => {
    expect(dataRow(findingsToCsv([makeFinding("")]))[10]).toBe("");
    const none = makeFinding("x");
    none.reasons = [];
    expect(dataRow(findingsToCsv([none]))[10]).toBe("");
  });

  it("joins several quotes with a newline inside one quoted field", () => {
    const f = makeFinding("pierwszy");
    f.reasons.push({ criterion: "c2", verdict: "v", quote: "drugi", weight: 1 });
    expect(findingsToCsv([f])).toContain('"pierwszy\ndrugi"');
  });

  it("keeps Polish characters, emoji and very long text intact", () => {
    const csv = findingsToCsv([makeFinding(`zażółć gęślą jaźń 🚀 ${"ż".repeat(50_000)}`)]);
    expect(csv).toContain("zażółć gęślą jaźń 🚀");
    expect(csv.length).toBeGreaterThan(50_000);
  });

  it("produces one data row per finding", () => {
    const rows = findingsToCsv([makeFinding("a"), makeFinding("b"), makeFinding("c")]).split("\r\n").filter(Boolean);
    expect(rows).toHaveLength(4);
  });
});

describe("findingsToJson", () => {
  it("returns valid JSON equal to the input", () => {
    const findings = [makeFinding("cytat")];
    expect(JSON.parse(findingsToJson(findings))).toEqual(findings);
  });

  it("returns [] for an empty list", () => {
    expect(JSON.parse(findingsToJson([]))).toEqual([]);
  });
});

describe("defaultExportFilename", () => {
  it("uses today's date and the requested extension", () => {
    expect(defaultExportFilename("csv")).toMatch(/^investwatch-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(defaultExportFilename("json")).toMatch(/\.json$/);
  });
});
