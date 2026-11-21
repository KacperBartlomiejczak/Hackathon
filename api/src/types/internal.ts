import { z } from "zod";

const entityRefSchema = z.object({ id: z.number().int().positive(), name: z.string() });

export const alertSchema = z.object({
  findingId: z.number().int().positive(),
  documentId: z.number().int().positive(),
  module: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  score: z.number().min(0).max(1),
  riskLevel: z.literal("high"),
  label: z.string().min(1),
  title: z.string().nullable(),
  url: z.string().url(),
  firm: entityRefSchema.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type AlertPayload = z.infer<typeof alertSchema>;

export const CRAWL_STATUSES = ["running", "ok", "partial", "failed"] as const;

export const crawlStatusSchema = z.object({
  crawlRunId: z.number().int().positive(),
  sourceId: z.number().int().positive(),
  status: z.enum(CRAWL_STATUSES),
  itemsFound: z.number().int().min(0),
  error: z.string().nullish(),
});
export type CrawlStatusPayload = z.infer<typeof crawlStatusSchema>;
