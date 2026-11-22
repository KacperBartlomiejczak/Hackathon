import { z } from "zod";
import { fromDateSchema, toDateSchema } from "./findings.js";

export const BUCKETS = ["day", "hour"] as const;

export const trendQuerySchema = z.object({
  module: z.coerce.number().pipe(z.union([z.literal(1), z.literal(2), z.literal(3)])).optional(),
  bucket: z.enum(BUCKETS).default("day"),
  from: fromDateSchema.optional(),
  to: toDateSchema.optional(),
});

export type CountItem<K> = { key: K; count: number };
