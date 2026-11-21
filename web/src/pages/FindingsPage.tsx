import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { QueryState } from "@/components/QueryState";
import { useSearchParams } from "react-router-dom";
import { FiltersBar, type FilterKey } from "@/components/FiltersBar";
import { FindingsTable } from "@/components/FindingsTable";
import { Pagination } from "@/components/Pagination";
import { DemoBadge } from "@/components/DemoBadge";
import { exportFindings, fetchFindings, fetchSources } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import type { ExportFormat } from "@/lib/exportFormat";
import type { FindingStatus, FindingsFilters, ModuleId, RiskLevel, SourceKind } from "@/types";

const FILTER_KEYS: FilterKey[] = ["q", "module", "risk", "status", "source", "from", "to"];

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

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["findings", filters],
    queryFn: () => fetchFindings(filters),
  });

  // Source filter lists only kinds that have a configured source; on error it falls back to all kinds.
  const sources = useQuery({ queryKey: ["sources"], queryFn: fetchSources, staleTime: 60_000 });
  const sourceKinds = sources.data ? [...new Set(sources.data.map((s) => s.kind))] : undefined;

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [exportTruncated, setExportTruncated] = useState(false);

  async function runExport(format: ExportFormat) {
    setExporting(true);
    setExportError(false);
    setExportTruncated(false);
    try {
      const { blob, filename, truncated } = await exportFindings(filters, format);
      downloadBlob(blob, filename);
      setExportTruncated(truncated);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  }

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  }

  const values = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ""])) as Record<FilterKey, string>;
  const hasFilters = FILTER_KEYS.some((k) => params.has(k));
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const page = filters.page ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Findingi</h1>
        <DemoBadge endpoints={["export"]} />
      </div>

      <FiltersBar
        values={values}
        sourceKinds={sourceKinds}
        hasFilters={hasFilters}
        onChange={setFilter}
        onClear={() => setParams({}, { replace: true })}
        exporting={exporting}
        exportDisabled={!data || data.total === 0}
        exportError={exportError}
        exportTruncated={exportTruncated}
        onExport={(format) => void runExport(format)}
      />

      <QueryState isLoading={isLoading} isError={isError} errorMessage="Nie udało się pobrać findingów." onRetry={() => void refetch()} />
      {data && data.items.length === 0 && <p className="text-sm text-slate-500">Brak findingów dla wybranych filtrów.</p>}

      {data && data.items.length > 0 && (
        <>
          <FindingsTable items={data.items} />
          <Pagination page={page} totalPages={totalPages} total={data.total} onPageChange={(p) => setFilter("page", String(p))} />
        </>
      )}
    </div>
  );
}
