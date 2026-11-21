import { defaultExportFilename, findingsToCsv, findingsToJson, type ExportFormat } from "@/lib/exportFormat";
import { mockFindingDetails, mockFindings, mockHistory } from "@/mocks";
import { mockEval, mockModuleSettings } from "@/mocks/calibration";
import { mockSources } from "@/mocks/sources";
import type {
  EvalResult,
  ModuleSettings,
  ModuleSettingsInput,
  Finding,
  FindingDetails,
  FindingListItem,
  FindingStatus,
  FindingsFilters,
  ModuleId,
  Page,
  Source,
  StatsSummary,
  TrendPoint,
} from "@/types";

export const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export type Endpoint = "findings" | "trend" | "summary" | "status" | "eval" | "settings" | "sources" | "export";

const ALL_ENDPOINTS: readonly Endpoint[] = ["findings", "trend", "summary", "status", "eval", "settings", "sources", "export"];
// Endpoints that the api does not serve yet; remove a name from VITE_MOCKED_ENDPOINTS once it ships.
const DEFAULT_MOCKED: readonly Endpoint[] = ["trend", "summary", "status", "eval", "settings", "sources", "export"];

function resolveMocked(): ReadonlySet<Endpoint> {
  const all: string | undefined = import.meta.env.VITE_USE_MOCKS;
  if (all === "true") return new Set(ALL_ENDPOINTS);
  if (all === "false") return new Set();
  const raw: string | undefined = import.meta.env.VITE_MOCKED_ENDPOINTS;
  if (raw === undefined) return new Set(DEFAULT_MOCKED);
  const names = raw.split(",").map((x) => x.trim());
  return new Set(ALL_ENDPOINTS.filter((e) => names.includes(e)));
}

const MOCKED = resolveMocked();
export const isMocked = (endpoint: Endpoint): boolean => MOCKED.has(endpoint);
export const PAGE_SIZE = 10;

type ApiFindingDetails = Omit<FindingDetails, "history" | "document"> & {
  document: Omit<FindingDetails["document"], "screenshotUrl">;
  screenshotUrl: string | null;
  statusHistory: FindingDetails["history"];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()) as T;
}

function matches(f: Finding, filters: FindingsFilters): boolean {
  if (filters.module && f.module !== filters.module) return false;
  if (filters.risk && f.riskLevel !== filters.risk) return false;
  if (filters.status && f.status !== filters.status) return false;
  if (filters.source && f.document.sourceKind !== filters.source) return false;
  if (filters.from && f.createdAt.slice(0, 10) < filters.from) return false;
  if (filters.to && f.createdAt.slice(0, 10) > filters.to) return false;
  if (filters.q) {
    const q = filters.q.toLowerCase();
    const haystack = [f.document.textClean, f.document.url, f.firm?.name, f.advertiser?.name, f.label]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

export async function exportFindings(
  filters: FindingsFilters,
  format: ExportFormat,
): Promise<{ blob: Blob; filename: string }> {
  if (isMocked("export")) {
    const all = mockFindings.filter((f) => matches(f, filters));
    const blob =
      format === "csv"
        ? new Blob([findingsToCsv(all)], { type: "text/csv;charset=utf-8" })
        : new Blob([findingsToJson(all)], { type: "application/json" });
    return { blob, filename: defaultExportFilename(format) };
  }
  const params = new URLSearchParams({ format });
  for (const [key, value] of Object.entries(filters)) {
    if (key === "page") continue;
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const res = await fetch(`${API_URL}/export?${params.toString()}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const filename = match ? decodeURIComponent(match[1]) : defaultExportFilename(format);
  return { blob: await res.blob(), filename };
}

export async function fetchFindings(filters: FindingsFilters): Promise<Page<FindingListItem>> {
  const page = filters.page ?? 1;
  if (isMocked("findings")) {
    const all = mockFindings.filter((f) => matches(f, filters));
    const start = (page - 1) * PAGE_SIZE;
    return { items: all.slice(start, start + PAGE_SIZE), total: all.length, page, pageSize: PAGE_SIZE };
  }
  const params = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return request<Page<FindingListItem>>(`/findings?${params.toString()}`);
}

export async function fetchFinding(id: number): Promise<FindingDetails> {
  if (isMocked("findings")) {
    const found = mockFindingDetails(id);
    if (!found) throw new Error("Nie znaleziono");
    return found;
  }
  const { statusHistory, screenshotUrl, ...rest } = await request<ApiFindingDetails>(`/findings/${id}`);
  return { ...rest, document: { ...rest.document, screenshotUrl }, history: statusHistory };
}

export async function fetchTrend(module?: ModuleId): Promise<TrendPoint[]> {
  if (isMocked("trend")) {
    const counts = new Map<string, number>();
    for (const f of mockFindings) {
      if (module && f.module !== module) continue;
      const day = f.createdAt.slice(0, 10);
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return [...counts.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
  }
  const params = new URLSearchParams({ bucket: "day" });
  if (module) params.set("module", String(module));
  return request<TrendPoint[]>(`/stats/trend?${params.toString()}`);
}

export async function fetchSummary(): Promise<StatsSummary> {
  if (isMocked("summary")) {
    const summary: StatsSummary = {
      total: mockFindings.length,
      byModule: { 1: 0, 2: 0, 3: 0 },
      byRisk: { low: 0, medium: 0, high: 0 },
      bySource: {},
    };
    for (const f of mockFindings) {
      summary.byModule[f.module] += 1;
      summary.byRisk[f.riskLevel] += 1;
      const kind = f.document.sourceKind;
      summary.bySource[kind] = (summary.bySource[kind] ?? 0) + 1;
    }
    return summary;
  }
  return request<StatsSummary>("/stats/summary");
}

export async function updateFindingStatus(id: number, status: FindingStatus): Promise<void> {
  if (isMocked("status")) {
    const f = mockFindings.find((x) => x.id === id);
    if (!f) throw new Error("Nie znaleziono");
    const history = mockHistory.get(id) ?? [];
    history.unshift({ oldStatus: f.status, newStatus: status, changedBy: "analityk", changedAt: new Date().toISOString() });
    mockHistory.set(id, history);
    f.status = status;
    return;
  }
  await request<unknown>(`/findings/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export async function fetchEval(module: ModuleId, threshold: number): Promise<EvalResult> {
  if (isMocked("eval")) return mockEval(module, threshold);
  const params = new URLSearchParams({ module: String(module), threshold: String(threshold) });
  return request<EvalResult>(`/eval?${params.toString()}`);
}

export async function fetchModuleSettings(module: ModuleId): Promise<ModuleSettings> {
  if (isMocked("settings")) return { ...mockModuleSettings[module], weights: { ...mockModuleSettings[module].weights } };
  return request<ModuleSettings>(`/settings/modules/${module}`);
}

export async function saveModuleSettings(module: ModuleId, input: ModuleSettingsInput): Promise<ModuleSettings> {
  if (isMocked("settings")) {
    const current = mockModuleSettings[module];
    current.threshold = input.threshold;
    if (input.weights) current.weights = { ...input.weights };
    return { ...current, weights: { ...current.weights } };
  }
  return request<ModuleSettings>(`/settings/modules/${module}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function fetchSources(): Promise<Source[]> {
  if (isMocked("sources")) return mockSources.map((s) => ({ ...s, lastRun: s.lastRun ? { ...s.lastRun } : null }));
  return request<Source[]>("/sources");
}

export async function runSource(id: number): Promise<void> {
  if (isMocked("sources")) {
    const source = mockSources.find((s) => s.id === id);
    if (!source) throw new Error("Nie znaleziono");
    if (source.lastRun?.status === "running") return;
    source.lastRun = { status: "running", startedAt: new Date().toISOString(), finishedAt: null, itemsFound: null, error: null };
    setTimeout(() => {
      source.lastRun = {
        status: "ok",
        startedAt: source.lastRun?.startedAt ?? new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        itemsFound: 20 + Math.floor(Math.random() * 180),
        error: null,
      };
    }, 2000);
    return;
  }
  await request<unknown>(`/sources/${id}/run`, { method: "POST" });
}
