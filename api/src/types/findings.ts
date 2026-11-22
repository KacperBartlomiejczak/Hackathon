import { z } from "zod";

export const MODULES = [1, 2, 3] as const;
export const RISK_LEVELS = ["low", "medium", "high"] as const;
export const FINDING_STATUSES = ["new", "in_review", "confirmed", "dismissed"] as const;
export const SOURCE_KINDS = ["web", "facebook", "instagram", "tiktok", "youtube", "sample"] as const;

/** Postgres rejects a NUL byte in text (500 otherwise); scraped-looking input can carry one. */
export const noNul = (s: string): boolean => !s.includes("\u0000");
const NUL_MESSAGE = "must not contain a NUL character";

// Bounds keep dates inside what Postgres timestamptz accepts (JS dates reach year ±275760).
const MIN_DATE = new Date("1970-01-01T00:00:00.000Z");
const MAX_DATE = new Date("9999-12-31T23:59:59.999Z");
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const boundedDate = z.coerce.date().min(MIN_DATE).max(MAX_DATE);

/** `from`: ISO date or timestamp; a bare date means 00:00:00 UTC of that day. */
export const fromDateSchema = boundedDate;
/**
 * `to`: a bare date (`<input type="date">`) covers the whole day, i.e. 23:59:59.999 UTC.
 * A full timestamp is used as given.
 */
export const toDateSchema = z.preprocess(
  (v) => (typeof v === "string" && DATE_ONLY.test(v) ? `${v}T23:59:59.999Z` : v),
  boundedDate,
);

export const listQuerySchema = z.object({
  module: z.coerce.number().pipe(z.union([z.literal(1), z.literal(2), z.literal(3)])).optional(),
  risk: z.enum(RISK_LEVELS).optional(),
  status: z.enum(FINDING_STATUSES).optional(),
  source: z.enum(SOURCE_KINDS).optional(),
  from: fromDateSchema.optional(),
  to: toDateSchema.optional(),
  q: z.string().trim().min(1).max(200).refine(noNul, NUL_MESSAGE).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListQuery = z.infer<typeof listQuerySchema>;
/** Filter part of the list query (no pagination); shared with GET /export. */
export type FindingsFilter = Omit<ListQuery, "page" | "pageSize">;

export const idParamsSchema = z.object({
  id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export const statusBodySchema = z.object({
  status: z.enum(["in_review", "confirmed", "dismissed"]),
  changedBy: z.string().trim().min(1).max(100).refine(noNul, NUL_MESSAGE).nullish(),
  note: z.string().max(500).refine(noNul, NUL_MESSAGE).optional(),
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
  document: {
    id: number;
    url: string;
    title: string | null;
    sourceKind: string;
    firstSeenAt: Date;
    lastSeenAt: Date;
    isActive: boolean;
  };
  firm: EntityRef;
  advertiser: EntityRef;
};

export type FindingList = {
  items: FindingListItem[];
  page: number;
  pageSize: number;
  total: number;
};
