import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { RiskBadge, StatusBadge } from "@/components/Badges";
import { fetchFindings, PAGE_SIZE } from "@/lib/api";
import { formatDate, MODULE_LABEL, RISK_LABEL, STATUS_LABEL } from "@/lib/utils";
import type { FindingStatus, FindingsFilters, ModuleId, RiskLevel, SourceKind } from "@/types";

const SOURCES: SourceKind[] = ["web", "facebook", "instagram", "tiktok", "youtube", "sample"];
const fieldClass = "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";

function readFilters(params: URLSearchParams): FindingsFilters {
  const module = params.get("module");
  return {
    module: module ? (Number(module) as ModuleId) : undefined,
    risk: (params.get("risk") as RiskLevel | null) ?? undefined,
    status: (params.get("status") as FindingStatus | null) ?? undefined,
    source: (params.get("source") as SourceKind | null) ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    q: params.get("q") ?? undefined,
    page: Number(params.get("page") ?? "1"),
  };
}

export default function FindingsPage() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["findings", filters],
    queryFn: () => fetchFindings(filters),
  });

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  }

  const hasFilters = ["module", "risk", "status", "source", "from", "to", "q"].some((k) => params.has(k));
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const page = filters.page ?? 1;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Findingi</h1>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Szukaj
          <input
            type="search"
            value={params.get("q") ?? ""}
            onChange={(e) => setFilter("q", e.target.value)}
            placeholder="Treść, firma, URL…"
            className={`${fieldClass} w-52`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Moduł
          <select value={params.get("module") ?? ""} onChange={(e) => setFilter("module", e.target.value)} className={fieldClass}>
            <option value="">Wszystkie</option>
            {([1, 2, 3] as ModuleId[]).map((m) => (
              <option key={m} value={m}>
                {MODULE_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Ryzyko
          <select value={params.get("risk") ?? ""} onChange={(e) => setFilter("risk", e.target.value)} className={fieldClass}>
            <option value="">Wszystkie</option>
            {(Object.keys(RISK_LABEL) as RiskLevel[]).map((r) => (
              <option key={r} value={r}>
                {RISK_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Status
          <select value={params.get("status") ?? ""} onChange={(e) => setFilter("status", e.target.value)} className={fieldClass}>
            <option value="">Wszystkie</option>
            {(Object.keys(STATUS_LABEL) as FindingStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Źródło
          <select value={params.get("source") ?? ""} onChange={(e) => setFilter("source", e.target.value)} className={fieldClass}>
            <option value="">Wszystkie</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Od
          <input type="date" value={params.get("from") ?? ""} onChange={(e) => setFilter("from", e.target.value)} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Do
          <input type="date" value={params.get("to") ?? ""} onChange={(e) => setFilter("to", e.target.value)} className={fieldClass} />
        </label>
        {hasFilters && (
          <button
            type="button"
            onClick={() => setParams({}, { replace: true })}
            className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            Wyczyść filtry
          </button>
        )}
      </div>

      {isLoading && <p className="text-sm text-slate-500">Ładowanie…</p>}
      {isError && <p className="text-sm text-red-600">Nie udało się pobrać findingów.</p>}
      {data && data.items.length === 0 && <p className="text-sm text-slate-500">Brak findingów dla wybranych filtrów.</p>}

      {data && data.items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Moduł</th>
                  <th className="px-4 py-3">Ryzyko</th>
                  <th className="px-4 py-3">Źródło</th>
                  <th className="px-4 py-3">Firma</th>
                  <th className="px-4 py-3">Reklamujący</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((f) => (
                  <tr key={f.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link to={`/findings/${f.id}`} className="text-blue-700 hover:underline">
                        {formatDate(f.createdAt)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{MODULE_LABEL[f.module]}</td>
                    <td className="px-4 py-3">
                      <RiskBadge level={f.riskLevel} />
                    </td>
                    <td className="px-4 py-3">{f.document.sourceKind}</td>
                    <td className="px-4 py-3">{f.firm?.name ?? "—"}</td>
                    <td className="px-4 py-3">{f.advertiser?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={f.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>
              Wyniki: {data.total} · strona {page} z {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setFilter("page", String(page - 1))}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40"
              >
                Poprzednia
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setFilter("page", String(page + 1))}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40"
              >
                Następna
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
