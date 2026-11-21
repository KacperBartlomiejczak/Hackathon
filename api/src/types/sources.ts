import { z } from "zod";

export const sourceIdParamsSchema = z.object({
  id: z.coerce.number().int().positive().max(2147483647),
});

export type CrawlJobPayload = { sourceId: number; trigger: "manual" | "schedule" };

export type LastRun = {
  id: number;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  itemsFound: number | null;
  error: string | null;
} | null;

export type SourceItem = {
  id: number;
  kind: string;
  name: string;
  startUrl: string | null;
  moduleHint: number | null;
  enabled: boolean;
  cron: string | null;
  lastRun: LastRun;
};
