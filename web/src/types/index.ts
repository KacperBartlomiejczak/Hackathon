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

export interface EntityRef {
  id: number;
  name: string;
}

/** Row of GET /findings: no reasons, no document text. */
export interface FindingListItem {
  id: number;
  module: ModuleId;
  score: number;
  riskLevel: RiskLevel;
  label: string;
  status: FindingStatus;
  createdAt: string;
  document: Pick<DocumentInfo, "id" | "url" | "title" | "sourceKind">;
  firm?: EntityRef | null;
  advertiser?: EntityRef | null;
}

/** Payload of the Socket.io event alert:new. */
export interface AlertPayload {
  findingId: number;
  documentId: number;
  module: ModuleId;
  score: number;
  riskLevel: "high";
  label: string;
  title: string | null;
  url: string;
  firm: EntityRef | null;
  createdAt: string;
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

/** `GET /export?format=json` (docs/contracts.md). Row keys depend on `module`; see `columns`. */
export interface ExportJson {
  module: ModuleId | null;
  generatedAt: string;
  count: number;
  truncated: boolean;
  columns: { key: string; label: string }[];
  rows: Record<string, string | number | string[] | null>[];
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

export interface EvalResult {
  precision: number;
  recall: number;
  fp: number;
  fn: number;
  tp: number;
  tn: number;
}

export interface ModuleWeights {
  llm: number;
  rules: number;
  emb: number;
}

export interface ModuleSettings {
  module: ModuleId;
  threshold: number;
  weights: ModuleWeights;
}

export interface ModuleSettingsInput {
  threshold: number;
  weights?: ModuleWeights;
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

export type CrawlStatus = "running" | "ok" | "partial" | "failed";

export interface CrawlRunInfo {
  status: CrawlStatus;
  startedAt: string;
  finishedAt: string | null;
  itemsFound: number | null;
  error: string | null;
}

export interface Source {
  id: number;
  kind: SourceKind;
  name: string;
  startUrl: string;
  moduleHint: ModuleId | null;
  enabled: boolean;
  cron: string | null;
  lastRun: CrawlRunInfo | null;
}
