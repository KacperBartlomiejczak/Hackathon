import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Api = typeof import("./api");

async function loadApi(env: Record<string, string>): Promise<Api> {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import("./api");
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("endpoint mocking config", () => {
  it("mocks everything for VITE_USE_MOCKS=true", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "true" });
    expect(api.isMocked("findings")).toBe(true);
    expect(api.isMocked("export")).toBe(true);
  });

  it("mocks nothing for VITE_USE_MOCKS=false, even with a mocked list", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "false", VITE_MOCKED_ENDPOINTS: "findings" });
    expect(api.isMocked("findings")).toBe(false);
  });

  it("parses VITE_MOCKED_ENDPOINTS with spaces and ignores unknown names", async () => {
    const api = await loadApi({ VITE_MOCKED_ENDPOINTS: " sources , bogus ,eval" });
    expect(api.isMocked("sources")).toBe(true);
    expect(api.isMocked("eval")).toBe(true);
    expect(api.isMocked("findings")).toBe(false);
  });

  it("mocks nothing by default", async () => {
    const api = await loadApi({});
    expect(api.isMocked("findings")).toBe(false);
  });

  it("treats an empty VITE_MOCKED_ENDPOINTS as nothing mocked", async () => {
    const api = await loadApi({ VITE_MOCKED_ENDPOINTS: "" });
    expect(api.isMocked("findings")).toBe(false);
  });
});

describe("fetchFindings (mocks)", () => {
  it("paginates and reports the total", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "true" });
    const first = await api.fetchFindings({});
    expect(first.items).toHaveLength(api.PAGE_SIZE);
    expect(first.total).toBeGreaterThan(api.PAGE_SIZE);
    expect(first.page).toBe(1);
  });

  it("returns a short last page", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "true" });
    const { total } = await api.fetchFindings({});
    const lastPage = Math.ceil(total / api.PAGE_SIZE);
    const last = await api.fetchFindings({ page: lastPage });
    expect(last.items.length).toBe(total - (lastPage - 1) * api.PAGE_SIZE);
  });

  it("returns an empty page beyond the last one", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "true" });
    const { total } = await api.fetchFindings({});
    const beyond = await api.fetchFindings({ page: Math.ceil(total / api.PAGE_SIZE) + 5 });
    expect(beyond.items).toEqual([]);
    expect(beyond.total).toBe(total);
  });

  it("returns an empty page for page 0", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "true" });
    expect((await api.fetchFindings({ page: 0 })).items).toEqual([]);
  });

  it("returns an empty page for a negative page", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "true" });
    expect((await api.fetchFindings({ page: -3 })).items).toEqual([]);
  });

  it("returns nothing for a search with no match", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "true" });
    const res = await api.fetchFindings({ q: "zzz-nie-ma-takiego-tekstu" });
    expect(res.total).toBe(0);
    expect(res.items).toEqual([]);
  });

  it("searches case-insensitively", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "true" });
    const lower = await api.fetchFindings({ q: "alfa invest" });
    const upper = await api.fetchFindings({ q: "ALFA INVEST" });
    expect(lower.total).toBeGreaterThan(0);
    expect(upper.total).toBe(lower.total);
  });

  it("returns nothing when the date range is reversed", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "true" });
    expect((await api.fetchFindings({ from: "2026-12-31", to: "2026-01-01" })).total).toBe(0);
  });

  it("includes both boundary days of a range", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "true" });
    const all = await api.fetchFindings({});
    const day = all.items[0].createdAt.slice(0, 10);
    const res = await api.fetchFindings({ from: day, to: day });
    expect(res.total).toBeGreaterThan(0);
    expect(res.items.every((f) => f.createdAt.startsWith(day))).toBe(true);
  });

  it("combines filters with AND", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "true" });
    const res = await api.fetchFindings({ module: 1, risk: "high" });
    expect(res.items.every((f) => f.module === 1 && f.riskLevel === "high")).toBe(true);
  });

  it("returns nothing for a filter value that matches no finding", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "true" });
    const res = await api.fetchFindings({ module: 1, risk: "high", status: "dismissed", source: "youtube", q: "qqq" });
    expect(res.total).toBe(0);
  });
});

describe("fetchFinding and status (mocks)", () => {
  it("throws for a non-existent id", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "true" });
    await expect(api.fetchFinding(999_999)).rejects.toThrow();
    await expect(api.fetchFinding(-1)).rejects.toThrow();
    await expect(api.fetchFinding(Number.NaN)).rejects.toThrow();
  });

  it("records a status change in the history, newest first", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "true" });
    const before = await api.fetchFinding(1);
    await api.updateFindingStatus(1, "confirmed");
    await api.updateFindingStatus(1, "dismissed");
    const after = await api.fetchFinding(1);
    expect(after.status).toBe("dismissed");
    expect(after.history[0].newStatus).toBe("dismissed");
    expect(after.history[0].oldStatus).toBe("confirmed");
    expect(after.history.length).toBe(before.history.length + 2);
  });

  it("throws when changing the status of a non-existent finding", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "true" });
    await expect(api.updateFindingStatus(999_999, "confirmed")).rejects.toThrow();
  });
});

describe("fetchTrend (mocks)", () => {
  it("returns consecutive days with zeros for quiet days", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "true" });
    const points = await api.fetchTrend();
    expect(points.length).toBeGreaterThan(0);
    for (let i = 1; i < points.length; i++) {
      const gap = Date.parse(points[i].date) - Date.parse(points[i - 1].date);
      expect(gap).toBe(86_400_000);
    }
    const total = (await api.fetchFindings({})).total;
    expect(points.reduce((sum, p) => sum + p.count, 0)).toBe(total);
  });
});

describe("fetchTrend (api)", () => {
  it("returns [] for an empty response", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "false" });
    fetchMock.mockResolvedValue(jsonResponse({ points: [] }));
    expect(await api.fetchTrend()).toEqual([]);
  });

  it("sums modules within one day and fills gaps, including across a month boundary", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "false" });
    fetchMock.mockResolvedValue(
      jsonResponse({
        points: [
          { bucket: "2026-11-29T00:00:00Z", module: 1, count: 2 },
          { bucket: "2026-11-29T00:00:00Z", module: 2, count: 3 },
          { bucket: "2026-12-02T00:00:00Z", module: 3, count: 1 },
        ],
      }),
    );
    expect(await api.fetchTrend()).toEqual([
      { date: "2026-11-29", count: 5 },
      { date: "2026-11-30", count: 0 },
      { date: "2026-12-01", count: 0 },
      { date: "2026-12-02", count: 1 },
    ]);
  });

  it("sorts unordered buckets", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "false" });
    fetchMock.mockResolvedValue(
      jsonResponse({
        points: [
          { bucket: "2026-11-03T00:00:00Z", module: 1, count: 1 },
          { bucket: "2026-11-01T00:00:00Z", module: 1, count: 1 },
        ],
      }),
    );
    expect((await api.fetchTrend()).map((p) => p.date)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });

  it("sends the module filter", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "false" });
    fetchMock.mockResolvedValue(jsonResponse({ points: [] }));
    await api.fetchTrend(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("module=2");
  });
});

describe("fetchSummary (api)", () => {
  it("ignores unknown module and risk keys and keeps zero defaults", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "false" });
    fetchMock.mockResolvedValue(
      jsonResponse({
        total: 4,
        byModule: [
          { key: 1, count: 3 },
          { key: 9, count: 100 },
        ],
        byRisk: [
          { key: "high", count: 4 },
          { key: "critical", count: 100 },
        ],
        bySourceKind: [{ key: "web", count: 4 }],
      }),
    );
    const s = await api.fetchSummary();
    expect(s.byModule).toEqual({ 1: 3, 2: 0, 3: 0 });
    expect(s.byRisk).toEqual({ low: 0, medium: 0, high: 4 });
    expect(s.bySource).toEqual({ web: 4 });
  });

  it("handles an empty database", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "false" });
    fetchMock.mockResolvedValue(jsonResponse({ total: 0, byModule: [], byRisk: [], bySourceKind: [] }));
    const s = await api.fetchSummary();
    expect(s.total).toBe(0);
    expect(s.byModule).toEqual({ 1: 0, 2: 0, 3: 0 });
  });
});

describe("fetchFinding (api)", () => {
  it("maps statusHistory to history and moves screenshotUrl into document", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "false" });
    fetchMock.mockResolvedValue(
      jsonResponse({
        id: 7,
        document: { id: 1, url: "https://x.pl" },
        screenshotUrl: null,
        statusHistory: [{ oldStatus: "new", newStatus: "in_review", changedBy: "a", changedAt: "2026-11-22T10:00:00Z" }],
      }),
    );
    const f = await api.fetchFinding(7);
    expect(f.history).toHaveLength(1);
    expect(f.document.screenshotUrl).toBeNull();
    expect("statusHistory" in f).toBe(false);
  });

  it("throws an ApiError carrying the status on 404", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "false" });
    fetchMock.mockResolvedValue(jsonResponse({ error: "not_found" }, 404));
    await expect(api.fetchFinding(1)).rejects.toMatchObject({ name: "ApiError", status: 404, code: "not_found" });
  });

  it("throws an ApiError on a 500 with an empty body", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "false" });
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    await expect(api.fetchFindings({})).rejects.toMatchObject({ status: 500, code: null });
  });

  it("propagates a network failure", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "false" });
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api.fetchFindings({})).rejects.toThrow("Failed to fetch");
  });
});

describe("fetchFindings (api) query string", () => {
  it("skips undefined and empty filters", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "false" });
    fetchMock.mockResolvedValue(jsonResponse({ items: [], total: 0, page: 1, pageSize: 10 }));
    await api.fetchFindings({ q: "", risk: undefined, module: 2 });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("module")).toBe("2");
    expect(url.searchParams.has("q")).toBe(false);
    expect(url.searchParams.has("risk")).toBe(false);
  });

  it("url-encodes special characters in the search text", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "false" });
    fetchMock.mockResolvedValue(jsonResponse({ items: [], total: 0, page: 1, pageSize: 10 }));
    await api.fetchFindings({ q: "a&b=c ż" });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("q")).toBe("a&b=c ż");
  });
});

describe("write requests and the admin token", () => {
  it("sends a Bearer token when configured", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "false", VITE_ADMIN_TOKEN: "secret" });
    fetchMock.mockResolvedValue(jsonResponse({}));
    await api.updateFindingStatus(1, "confirmed");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("trims the token and sends no header for a blank one", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "false", VITE_ADMIN_TOKEN: "   " });
    fetchMock.mockResolvedValue(jsonResponse({}));
    await api.updateFindingStatus(1, "confirmed");
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("sends no body and no Content-Type for runSource", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "false" });
    fetchMock.mockResolvedValue(jsonResponse({}));
    await api.runSource(3);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("surfaces a 401 from a write as an ApiError", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "false" });
    fetchMock.mockResolvedValue(jsonResponse({ error: "unauthorized" }, 401));
    await expect(api.saveModuleSettings(1, { threshold: 0.5 })).rejects.toMatchObject({ status: 401 });
  });
});

describe("exportFindings (api)", () => {
  it("omits page and empty filters and reads the filename from Content-Disposition", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "false" });
    fetchMock.mockResolvedValue(
      new Response("a;b", { headers: { "Content-Disposition": 'attachment; filename="raport.csv"' } }),
    );
    const res = await api.exportFindings({ page: 3, q: "", risk: "high" }, "csv");
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("format")).toBe("csv");
    expect(url.searchParams.get("risk")).toBe("high");
    expect(url.searchParams.has("page")).toBe(false);
    expect(url.searchParams.has("q")).toBe(false);
    expect(res.filename).toBe("raport.csv");
    expect(res.truncated).toBe(false);
  });

  it("decodes an RFC 5987 filename", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "false" });
    fetchMock.mockResolvedValue(
      new Response("{}", { headers: { "Content-Disposition": "attachment; filename*=UTF-8''raport%20%C5%BC.json" } }),
    );
    expect((await api.exportFindings({}, "json")).filename).toBe("raport ż.json");
  });

  it("falls back to the default filename without the header", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "false" });
    fetchMock.mockResolvedValue(new Response("x"));
    expect((await api.exportFindings({}, "csv")).filename).toMatch(/^investwatch-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("reports truncation", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "false" });
    fetchMock.mockResolvedValue(new Response("x", { headers: { "X-Export-Truncated": "true" } }));
    expect((await api.exportFindings({}, "csv")).truncated).toBe(true);
  });

  it("throws an ApiError on failure", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "false" });
    fetchMock.mockResolvedValue(jsonResponse({ error: "boom" }, 500));
    await expect(api.exportFindings({}, "csv")).rejects.toMatchObject({ status: 500 });
  });

  it("exports an empty set in mock mode as a header-only CSV and [] JSON", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "true" });
    const csv = await api.exportFindings({ q: "zzz-nie-ma" }, "csv");
    expect((await csv.blob.text()).split("\r\n").filter(Boolean)).toHaveLength(1);
    const json = await api.exportFindings({ q: "zzz-nie-ma" }, "json");
    expect(JSON.parse(await json.blob.text())).toEqual([]);
  });
});

describe("sources (mocks)", () => {
  it("throws when running a non-existent source", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "true" });
    await expect(api.runSource(999_999)).rejects.toThrow();
  });

  it("returns copies so callers cannot mutate the store", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "true" });
    const first = await api.fetchSources();
    first[0].name = "zmienione";
    expect((await api.fetchSources())[0].name).not.toBe("zmienione");
  });
});

describe("module settings (mocks)", () => {
  it("persists a saved threshold and does not leak the weights object", async () => {
    const api = await loadApi({ VITE_USE_MOCKS: "true" });
    const saved = await api.saveModuleSettings(1, { threshold: 0.42 });
    expect(saved.threshold).toBe(0.42);
    const read = await api.fetchModuleSettings(1);
    expect(read.threshold).toBe(0.42);
    read.weights.llm = 123;
    expect((await api.fetchModuleSettings(1)).weights.llm).not.toBe(123);
  });
});
