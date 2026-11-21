import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IncidentChart } from "@/components/IncidentChart";
import { ModuleSelect } from "@/components/ModuleSelect";
import { Tile } from "@/components/Tile";
import { DemoBadge } from "@/components/DemoBadge";
import { fetchSummary, fetchTrend } from "@/lib/api";
import { MODULE_LABEL, RISK_LABEL } from "@/lib/utils";
import type { ModuleId, RiskLevel } from "@/types";

const RISK_TONE: Record<RiskLevel, string> = { high: "text-red-600", medium: "text-amber-600", low: "text-emerald-600" };

export default function TrendsPage() {
  const [module, setModule] = useState<ModuleId | undefined>(undefined);

  const summary = useQuery({ queryKey: ["summary"], queryFn: fetchSummary });
  const trend = useQuery({ queryKey: ["trend", module], queryFn: () => fetchTrend(module) });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Trendy</h1>
        <DemoBadge endpoints={["summary","trend"]} />
      </div>

      {summary.isLoading && <p className="text-sm text-slate-500">Ładowanie…</p>}
      {summary.isError && <p className="text-sm text-red-600">Nie udało się pobrać statystyk.</p>}
      {summary.data && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Wszystkie findingi" value={summary.data.total} />
            {(Object.keys(RISK_LABEL) as RiskLevel[]).reverse().map((r) => (
              <Tile key={r} label={`Ryzyko: ${RISK_LABEL[r].toLowerCase()}`} value={summary.data.byRisk[r]} tone={RISK_TONE[r]} />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {([1, 2, 3] as ModuleId[]).map((m) => (
              <Tile key={m} label={MODULE_LABEL[m]} value={summary.data.byModule[m]} />
            ))}
          </div>
        </div>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase text-slate-500">Incydenty w czasie</h2>
          <ModuleSelect value={module} onChange={setModule} />
        </div>
        {trend.isLoading && <p className="text-sm text-slate-500">Ładowanie…</p>}
        {trend.isError && <p className="text-sm text-red-600">Nie udało się pobrać trendu.</p>}
        {trend.data && trend.data.length === 0 && <p className="text-sm text-slate-500">Brak danych.</p>}
        {trend.data && trend.data.length > 0 && <IncidentChart data={trend.data} />}
      </section>
    </div>
  );
}
