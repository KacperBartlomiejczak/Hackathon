import { z } from "zod";
import { listQuerySchema } from "./findings.js";

export const EXPORT_FORMATS = ["csv", "json"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Same filters as GET /findings (no pagination) + required `format`. */
export const exportQuerySchema = listQuerySchema
  .omit({ page: true, pageSize: true })
  .extend({ format: z.enum(EXPORT_FORMATS) });
export type ExportQuery = z.infer<typeof exportQuerySchema>;

/** Hard cap on exported rows; more matches → response is truncated and flagged. */
export const EXPORT_MAX_ROWS = 10_000;
/** Length of the M1 content excerpt (characters of `documents.text_clean`). */
export const EXCERPT_LENGTH = 300;
/** Per-IP limit for GET /export (each call builds up to EXPORT_MAX_ROWS in memory). */
export const EXPORT_RATE_LIMIT_PER_MINUTE = 10;

export type ExportKey =
  | "id"
  | "module"
  | "firm"
  | "advertiser"
  | "entity"
  | "title"
  | "contentExcerpt"
  | "failedCriteria"
  | "advisoryPhrases"
  | "quotes"
  | "url"
  | "sourceKind"
  | "createdAt"
  | "score"
  | "riskLevel"
  | "status"
  | "label";

export type ExportValue = string | number | string[] | null;
export type ExportRow = Partial<Record<ExportKey, ExportValue>>;

/**
 * `join` = separator used when an array value is written to a single CSV cell.
 * `decimals` = fixed decimals for a numeric CSV cell (JSON keeps the raw number).
 * `handle` = column may hold a social handle; CSV drops its leading "@" so Excel shows
 *   `lukasz_inwestuje` instead of `'@lukasz_inwestuje` (JSON keeps the "@").
 */
export type ExportColumn = {
  key: ExportKey;
  label: string;
  join?: string;
  decimals?: number;
  handle?: boolean;
};

const CRITERIA_SEP = "; ";
const QUOTES_SEP = " | ";

// Headers in Polish: the export is a report for UKNF analysts.
export const UNIVERSAL_COLUMNS: readonly ExportColumn[] = [
  { key: "id", label: "ID" },
  { key: "module", label: "Moduł" },
  { key: "firm", label: "Firma" },
  { key: "advertiser", label: "Reklamujący", handle: true },
  { key: "title", label: "Tytuł" },
  { key: "url", label: "URL" },
  { key: "sourceKind", label: "Źródło" },
  { key: "createdAt", label: "Data" },
  { key: "score", label: "Score", decimals: 2 },
  { key: "riskLevel", label: "Ryzyko" },
  { key: "status", label: "Status" },
  { key: "label", label: "Etykieta" },
];

export const MODULE_COLUMNS: Record<1 | 2 | 3, readonly ExportColumn[]> = {
  1: [
    { key: "firm", label: "Firma" },
    { key: "advertiser", label: "Reklamujący", handle: true },
    { key: "contentExcerpt", label: "Treść (skrót)" },
    { key: "url", label: "URL" },
    { key: "createdAt", label: "Data" },
    { key: "score", label: "Score", decimals: 2 },
    { key: "status", label: "Status" },
  ],
  2: [
    { key: "firm", label: "Firma" },
    { key: "failedCriteria", label: "Niespełnione kryteria", join: CRITERIA_SEP },
    { key: "quotes", label: "Cytaty", join: QUOTES_SEP },
    { key: "url", label: "URL" },
    { key: "createdAt", label: "Data" },
    { key: "score", label: "Score", decimals: 2 },
  ],
  3: [
    { key: "entity", label: "Podmiot", handle: true },
    { key: "advisoryPhrases", label: "Frazy doradcze", join: CRITERIA_SEP },
    { key: "quotes", label: "Cytaty", join: QUOTES_SEP },
    { key: "url", label: "URL" },
    { key: "createdAt", label: "Data" },
    { key: "score", label: "Score", decimals: 2 },
  ],
};

export type ExportJson = {
  module: 1 | 2 | 3 | null;
  generatedAt: string;
  count: number;
  truncated: boolean;
  columns: { key: ExportKey; label: string }[];
  rows: ExportRow[];
};
