export type RiskLevel = "low" | "medium" | "high";
export type FindingStatus = "new" | "in_review" | "confirmed" | "dismissed";
export type ModuleId = 1 | 2 | 3;
export type SourceKind = "web" | "facebook" | "instagram" | "tiktok" | "youtube" | "sample";
export type EntityType =
  | "investment_firm"
  | "foreign_firm"
  | "advertiser"
  | "finfluencer"
  | "advisory_unlicensed"
  | "unknown";

export interface Reason {
  criterion: string;
  verdict: string;
  quote: string;
  weight: number;
}

export interface Entity {
  id: number;
  name: string;
  type: EntityType;
  isAuthorized: boolean;
}

export interface DocumentInfo {
  id: number;
  url: string;
  sourceKind: SourceKind;
  fetchedAt: string;
  publishedAt: string | null;
  authorHandle: string | null;
  title: string | null;
  screenshotUrl: string | null;
  textClean: string | null;
}

export interface Finding {
  id: number;
  documentId: number;
  module: ModuleId;
  score: number;
  riskLevel: RiskLevel;
  label: string;
  reasons: Reason[];
  firmEntityId: number | null;
  advertiserEntityId: number | null;
  firm?: Entity | null;
  advertiser?: Entity | null;
  model: string;
  promptVersion: string;
  status: FindingStatus;
  createdAt: string;
  document: DocumentInfo;
}

export interface StatusHistoryEntry {
  oldStatus: FindingStatus | null;
  newStatus: FindingStatus;
  changedBy: string | null;
  changedAt: string;
}

export interface FindingDetails extends Finding {
  history: StatusHistoryEntry[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TrendPoint {
  date: string;
  count: number;
}

export interface StatsSummary {
  total: number;
  byModule: Record<ModuleId, number>;
  byRisk: Record<RiskLevel, number>;
  bySource: Partial<Record<SourceKind, number>>;
}

export interface FindingsFilters {
  module?: ModuleId;
  risk?: RiskLevel;
  status?: FindingStatus;
  source?: SourceKind;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
}
