import { z } from "zod";

export const BUCKETS = ["day", "hour"] as const;

export const trendQuerySchema = z.object({
  module: z.coerce.number().pipe(z.union([z.literal(1), z.literal(2), z.literal(3)])).optional(),
  bucket: z.enum(BUCKETS).default("day"),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type CountItem<K> = { key: K; count: number };
