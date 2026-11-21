import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchSummary, fetchTrend } from "@/lib/api";
import { MODULE_LABEL, RISK_LABEL } from "@/lib/utils";
import type { ModuleId, RiskLevel } from "@/types";

function Tile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

export default function TrendsPage() {
  const [module, setModule] = useState<ModuleId | undefined>(undefined);

  const summary = useQuery({ queryKey: ["summary"], queryFn: fetchSummary });
  const trend = useQuery({ queryKey: ["trend", module], queryFn: () => fetchTrend(module) });

  const riskTone: Record<RiskLevel, string> = { high: "text-red-600", medium: "text-amber-600", low: "text-emerald-600" };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Trendy</h1>

      {summary.isLoading && <p className="text-sm text-slate-500">Ładowanie…</p>}
      {summary.isError && <p className="text-sm text-red-600">Nie udało się pobrać statystyk.</p>}
      {summary.data && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Wszystkie findingi" value={summary.data.total} />
            {(Object.keys(RISK_LABEL) as RiskLevel[]).reverse().map((r) => (
              <Tile key={r} label={`Ryzyko: ${RISK_LABEL[r].toLowerCase()}`} value={summary.data.byRisk[r]} tone={riskTone[r]} />
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
          <select
            value={module ?? ""}
            onChange={(e) => setModule(e.target.value ? (Number(e.target.value) as ModuleId) : undefined)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Wszystkie moduły</option>
            {([1, 2, 3] as ModuleId[]).map((m) => (
              <option key={m} value={m}>
                {MODULE_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
        {trend.isLoading && <p className="text-sm text-slate-500">Ładowanie…</p>}
        {trend.isError && <p className="text-sm text-red-600">Nie udało się pobrać trendu.</p>}
        {trend.data && trend.data.length === 0 && <p className="text-sm text-slate-500">Brak danych.</p>}
        {trend.data && trend.data.length > 0 && (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend.data} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" name="Incydenty" stroke="#0f172a" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}
