import { describe, expect, it } from "vitest";
import type { Finding } from "@/types";
import { findingsToCsv, findingsToJson } from "./exportFormat";

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
});

describe("findingsToJson", () => {
  it("returns valid JSON equal to the input", () => {
    const findings = [makeFinding("cytat")];
    expect(JSON.parse(findingsToJson(findings))).toEqual(findings);
  });
});
