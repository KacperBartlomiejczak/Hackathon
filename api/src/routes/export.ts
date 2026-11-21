import { desc, eq, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import type { Db } from "../db/client.js";
import { documents, findings } from "../db/schema.js";
import {
  EXCERPT_LENGTH,
  EXPORT_MAX_ROWS,
  MODULE_COLUMNS,
  UNIVERSAL_COLUMNS,
  exportQuerySchema,
  type ExportColumn,
  type ExportJson,
  type ExportRow,
  type ExportValue,
} from "../types/export.js";
import { advertiserEntity, buildFindingsWhere, firmEntity } from "./findings.js";

type Deps = { db: Db };

const BOM = "﻿";
const CRLF = "\r\n";

/**
 * One CSV cell (RFC 4180). Scraped content is untrusted, so text starting with a formula
 * trigger (= + - @ TAB CR) gets a leading apostrophe and Excel/LibreOffice will not evaluate it.
 */
export function csvCell(value: ExportValue | undefined, col: Partial<ExportColumn> = {}): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return col.decimals !== undefined ? value.toFixed(col.decimals) : String(value);
  let text = Array.isArray(value) ? value.join(col.join ?? ", ") : value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Whole CSV document: BOM + header row + data rows, CRLF line endings. */
export function toCsv(columns: readonly ExportColumn[], rows: readonly ExportRow[]): string {
  const lines = [columns.map((c) => csvCell(c.label)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvCell(row[c.key], c)).join(","));
  }
  return BOM + lines.join(CRLF) + CRLF;
}

type ReasonLike = { criterion?: unknown; verdict?: unknown; quote?: unknown };

/** `findings.reasons` is jsonb written by ai/ — read defensively, never trust its shape. */
function readReasons(raw: unknown): { criterion: string; verdict: string; quote: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is ReasonLike => typeof r === "object" && r !== null)
    .map((r) => ({
      criterion: typeof r.criterion === "string" ? r.criterion : "",
      verdict: typeof r.verdict === "string" ? r.verdict : "",
      quote: typeof r.quote === "string" ? r.quote : "",
    }));
}

const uniq = (xs: string[]): string[] => [...new Set(xs.filter((x) => x.length > 0))];

export const exportRoutes: FastifyPluginAsync<Deps> = async (app, { db }) => {
  app.get("/export", async (request, reply) => {
    const started = Date.now();
    const query = exportQuerySchema.parse(request.query);

    const rows = await db
      .select({
        id: findings.id,
        module: findings.module,
        score: findings.score,
        riskLevel: findings.riskLevel,
        label: findings.label,
        status: findings.status,
        reasons: findings.reasons,
        createdAt: findings.createdAt,
        docUrl: documents.url,
        docTitle: documents.title,
        docSourceKind: documents.sourceKind,
        authorHandle: documents.authorHandle,
        excerpt: sql<string | null>`left(${documents.textClean}, ${EXCERPT_LENGTH})`,
        excerptCut: sql<boolean>`coalesce(char_length(${documents.textClean}) > ${EXCERPT_LENGTH}, false)`,
        firmName: firmEntity.name,
        advertiserName: advertiserEntity.name,
      })
      .from(findings)
      .innerJoin(documents, eq(documents.id, findings.documentId))
      .leftJoin(firmEntity, eq(firmEntity.id, findings.firmEntityId))
      .leftJoin(advertiserEntity, eq(advertiserEntity.id, findings.advertiserEntityId))
      .where(buildFindingsWhere(query))
      .orderBy(desc(findings.createdAt), desc(findings.id))
      .limit(EXPORT_MAX_ROWS + 1);

    const truncated = rows.length > EXPORT_MAX_ROWS;
    if (truncated) rows.length = EXPORT_MAX_ROWS;

    const columns = query.module !== undefined ? MODULE_COLUMNS[query.module] : UNIVERSAL_COLUMNS;
    const exportRows: ExportRow[] = rows.map((r) => {
      const reasons = readReasons(r.reasons);
      const flagged = reasons.filter((x) => x.verdict !== "pass");
      const excerptText = (r.excerpt ?? "").replace(/\s+/g, " ").trim();
      const full: ExportRow = {
        id: r.id,
        module: r.module,
        firm: r.firmName,
        advertiser: r.advertiserName ?? r.authorHandle,
        entity: r.advertiserName ?? r.firmName ?? r.authorHandle,
        title: r.docTitle,
        contentExcerpt: excerptText ? `${excerptText}${r.excerptCut ? "…" : ""}` : r.docTitle,
        failedCriteria: uniq(reasons.filter((x) => x.verdict === "fail").map((x) => x.criterion)),
        advisoryPhrases: uniq(flagged.map((x) => x.criterion)),
        quotes: uniq(flagged.map((x) => x.quote)),
        url: r.docUrl,
        sourceKind: r.docSourceKind,
        createdAt: r.createdAt.toISOString(),
        score: r.score,
        riskLevel: r.riskLevel,
        status: r.status,
        label: r.label,
      };
      // Keep only the columns of the selected report.
      return Object.fromEntries(columns.map((c) => [c.key, full[c.key] ?? null])) as ExportRow;
    });

    request.log.info(
      {
        format: query.format,
        module: query.module ?? null,
        rows: exportRows.length,
        truncated,
        ms: Date.now() - started,
      },
      "findings exported",
    );
    if (truncated) {
      request.log.warn({ maxRows: EXPORT_MAX_ROWS }, "export truncated");
      reply.header("X-Export-Truncated", "true");
    }

    if (query.format === "csv") {
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", 'attachment; filename="findings.csv"')
        .send(toCsv(columns, exportRows));
    }

    const body: ExportJson = {
      module: query.module ?? null,
      generatedAt: new Date().toISOString(),
      count: exportRows.length,
      truncated,
      columns: columns.map(({ key, label }) => ({ key, label })),
      rows: exportRows,
    };
    return reply
      .header("Content-Type", "application/json; charset=utf-8")
      .header("Content-Disposition", 'attachment; filename="findings.json"')
      .send(body);
  });
};
