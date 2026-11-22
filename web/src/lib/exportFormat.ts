import { MODULE_LABEL, RISK_LABEL, STATUS_LABEL } from "@/lib/utils";
import type { Finding } from "@/types";

export type ExportFormat = "csv" | "json";

const CSV_HEADERS = [
  "Data",
  "Moduł",
  "Ryzyko",
  "Wynik",
  "Etykieta",
  "Źródło",
  "URL",
  "Firma",
  "Reklamujący",
  "Status",
  "Cytaty",
];

// A plain social handle such as "@jacek" is not a formula (no parentheses or operators).
const PLAIN_HANDLE = /^@[\w.]+$/;

function csvField(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (typeof value === "number") text = text.replace(".", ",");
  // Neutralise spreadsheet formula injection: text scraped from third-party pages.
  else if (/^[=+\-@\t\r]/.test(text) && !PLAIN_HANDLE.test(text)) text = `'${text}`;
  if (/[";\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function findingsToCsv(findings: Finding[]): string {
  const rows = findings.map((f) =>
    [
      f.createdAt,
      MODULE_LABEL[f.module],
      RISK_LABEL[f.riskLevel],
      f.score,
      f.label,
      f.document.sourceKind,
      f.document.url,
      f.firm?.name,
      f.advertiser?.name,
      STATUS_LABEL[f.status],
      f.reasons.map((r) => r.quote).filter(Boolean).join("\n"),
    ]
      .map(csvField)
      .join(";"),
  );
  return `\uFEFF${[CSV_HEADERS.map(csvField).join(";"), ...rows].join("\r\n")}\r\n`;
}

export function findingsToJson(findings: Finding[]): string {
  return JSON.stringify(findings, null, 2);
}

export function defaultExportFilename(format: ExportFormat): string {
  return `investwatch-${new Date().toISOString().slice(0, 10)}.${format}`;
}
