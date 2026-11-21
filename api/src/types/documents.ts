import type { Reason } from "../db/schema.js";
import type { EntityRef } from "./findings.js";

/** Keys of `modules` in the aggregated document (JSON object keys are strings). */
export const MODULE_KEYS = ["1", "2", "3"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const RISK_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

/** Minimum a finding needs to take part in the aggregation. */
export type AggregatableFinding = { module: number; score: number; riskLevel: string; createdAt: Date };

/** One module's result inside the aggregated document (GET /documents). */
export type ModuleResult = {
  id: number;
  module: number;
  score: number;
  riskLevel: string;
  label: string;
  status: string;
  createdAt: Date;
  firm: EntityRef;
  advertiser: EntityRef;
};

/** GET /documents/:id adds the evidence of each module. */
export type ModuleResultDetail = ModuleResult & { reasons: Reason[]; model: string; promptVersion: string };

/** Cross-module summary of one document. */
export type Overall = {
  maxScore: number | null;
  /** Highest risk level among the modules (high > medium > low), null without findings. */
  riskLevel: string | null;
  /** Modules with riskLevel medium or high (score >= module threshold), ascending. */
  flaggedModules: number[];
  findingsCount: number;
  lastFindingAt: Date | null;
};

export type Aggregate<T> = { overall: Overall; modules: Record<ModuleKey, T | null> };

export type DocumentSummary = {
  id: number;
  url: string;
  title: string | null;
  sourceKind: string;
  authorHandle: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  isActive: boolean;
};

export type AggregatedDocument = Aggregate<ModuleResult> & { document: DocumentSummary };

export type AggregatedDocumentList = {
  items: AggregatedDocument[];
  page: number;
  pageSize: number;
  total: number;
};
