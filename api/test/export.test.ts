import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvCell, toCsv } from "../src/routes/export.js";
import type { ExportColumn } from "../src/types/export.js";

/** Minimal RFC 4180 reader for one line with ";" delimiter (enough for these assertions). */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ";") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

const cellValue = (raw: string): string => parseCsvLine(raw)[0] ?? "";

describe("csvCell — formula injection guard (#31)", () => {
  it("prefixes =HYPERLINK(...) with an apostrophe", () => {
    const raw = csvCell('=HYPERLINK("http://evil.example","kliknij")');
    assert.ok(cellValue(raw).startsWith("'="), raw);
    assert.equal(cellValue(raw), `'=HYPERLINK("http://evil.example","kliknij")`);
  });

  for (const trigger of ["=", "+", "-", "@", "\t", "\r"]) {
    it(`prefixes text starting with ${JSON.stringify(trigger)}`, () => {
      assert.ok(cellValue(csvCell(`${trigger}cmd|' /C calc'!A0`)).startsWith(`'${trigger}`));
    });
  }

  it("leaves ordinary text and numbers alone", () => {
    assert.equal(csvCell("Zysk 20% bez ryzyka"), "Zysk 20% bez ryzyka");
    assert.equal(csvCell(-1), "-1");
    assert.equal(csvCell(0.8333, { decimals: 2 }), "0,83");
    assert.equal(csvCell(null), "");
  });
});

describe("csvCell — handle columns (#25)", () => {
  const handleCol: Partial<ExportColumn> = { handle: true };

  it("drops the leading @ so Excel shows no apostrophe", () => {
    assert.equal(csvCell("@lukasz_inwestuje", handleCol), "lukasz_inwestuje");
    assert.equal(csvCell("@@double", handleCol), "double");
  });

  it("keeps entity names without @ unchanged", () => {
    assert.equal(csvCell("XTB S.A.", handleCol), "XTB S.A.");
  });

  it("still guards a formula hidden behind the @", () => {
    assert.equal(cellValue(csvCell("@=1+1", handleCol)), "'=1+1");
    assert.equal(cellValue(csvCell("@-2", handleCol)), "'-2");
  });

  it("keeps the apostrophe for @ in non-handle columns", () => {
    assert.equal(csvCell("@lukasz_inwestuje"), "'@lukasz_inwestuje");
  });
});

describe("csvCell — quoting", () => {
  it("quotes ; , quotes and newlines", () => {
    assert.equal(csvCell("a;b"), '"a;b"');
    assert.equal(csvCell("a,b"), '"a,b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
  });

  it("joins arrays with the column separator", () => {
    assert.equal(csvCell(["a", "b"], { join: " | " }), "a | b");
  });
});

describe("toCsv", () => {
  const columns: ExportColumn[] = [
    { key: "advertiser", label: "Reklamujący", handle: true },
    { key: "quotes", label: "Cytaty", join: " | " },
    { key: "score", label: "Score", decimals: 2 },
  ];

  it("writes BOM, ; delimiter and CRLF line endings", () => {
    const csv = toCsv(columns, [{ advertiser: "@finfluencer", quotes: ["=SUM(1)", "ok"], score: 0.9 }]);
    assert.ok(csv.startsWith("﻿"));
    const lines = csv.slice(1).split("\r\n");
    assert.deepEqual(lines, ["Reklamujący;Cytaty;Score", "finfluencer;'=SUM(1) | ok;0,90", ""]);
  });
});
