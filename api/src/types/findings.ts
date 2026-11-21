import { z } from "zod";

export const MODULES = [1, 2, 3] as const;
export const RISK_LEVELS = ["low", "medium", "high"] as const;
export const FINDING_STATUSES = ["new", "in_review", "confirmed", "dismissed"] as const;
export const SOURCE_KINDS = ["web", "facebook", "instagram", "tiktok", "youtube", "sample"] as const;

export const listQuerySchema = z.object({
  module: z.coerce.number().pipe(z.union([z.literal(1), z.literal(2), z.literal(3)])).optional(),
  risk: z.enum(RISK_LEVELS).optional(),
  status: z.enum(FINDING_STATUSES).optional(),
  source: z.enum(SOURCE_KINDS).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const idParamsSchema = z.object({
  id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export const statusBodySchema = z.object({
  status: z.enum(["in_review", "confirmed", "dismissed"]),
  changedBy: z.string().trim().min(1).max(100).nullish(),
  note: z.string().max(500).optional(),
});

// No re-open: terminal states have no outgoing transitions.
export const STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  new: ["in_review"],
  in_review: ["confirmed", "dismissed"],
  confirmed: [],
  dismissed: [],
};

export type FindingUpdatedPayload = {
  id: number;
  module: number;
  riskLevel: string;
  oldStatus: string;
  status: string;
  changedBy: string | null;
  changedAt: string;
};

export type EntityRef = { id: number; name: string } | null;

export type FindingListItem = {
  id: number;
  module: number;
  score: number;
  riskLevel: string;
  label: string;
  status: string;
  createdAt: Date;
  document: { id: number; url: string; title: string | null; sourceKind: string };
  firm: EntityRef;
  advertiser: EntityRef;
};

export type FindingList = {
  items: FindingListItem[];
  page: number;
  pageSize: number;
  total: number;
};
