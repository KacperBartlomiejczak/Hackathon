import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchEval, fetchModuleSettings, saveModuleSettings } from "@/lib/api";
import { MODULE_LABEL } from "@/lib/utils";
import { mockFindings } from "@/mocks";
import type { ModuleId } from "@/types";

const MODULES: ModuleId[] = [1, 2, 3];

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function f1(precision: number, recall: number): number {
  const sum = precision + recall;
  return sum === 0 ? 0 : (2 * precision * recall) / sum;
}

export default function CalibrationPage() {
  const queryClient = useQueryClient();
  const [module, setModule] = useState<ModuleId>(1);
  const [override, setOverride] = useState<number | null>(null);
  const [debounced, setDebounced] = useState<number | null>(null);

  const settings = useQuery({ queryKey: ["module-settings", module], queryFn: () => fetchModuleSettings(module) });
  const saved = settings.data?.threshold;
  const threshold = override ?? saved ?? null;

  useEffect(() => {
    if (threshold === null) return;
    const id = setTimeout(() => setDebounced(threshold), 200);
    return () => clearTimeout(id);
  }, [threshold]);

  const evalQuery = useQuery({
    queryKey: ["eval", module, debounced],
    queryFn: () => fetchEval(module, debounced as number),
    enabled: debounced !== null,
    placeholderData: keepPreviousData,
  });

  const resultsCount = useMemo(() => {
    if (threshold === null) return 0;
    return mockFindings.filter((f) => f.module === module && f.score >= threshold).length;
  }, [module, threshold]);

  const save = useMutation({
    mutationFn: (value: number) => saveModuleSettings(module, { threshold: value }),
    onSuccess: (data) => {
      queryClient.setQueryData(["module-settings", module], data);
      setOverride(null);
    },
  });

  function changeModule(next: ModuleId) {
    setModule(next);
    setOverride(null);
    setDebounced(null);
    save.reset();
  }

  function changeThreshold(value: number) {
    setOverride(Math.round(value * 100) / 100);
    save.reset();
  }

  const dirty = threshold !== null && saved !== undefined && Math.abs(threshold - saved) > 0.0001;
  const data = evalQuery.data;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Kalibracja</h1>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Moduł" className="flex gap-1 rounded-md bg-slate-100 p-1">
            {MODULES.map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={m === module}
                onClick={() => changeModule(m)}
                className={`rounded px-3 py-1.5 text-sm ${m === module ? "bg-white font-semibold shadow-sm" : "text-slate-600"}`}
              >
                {MODULE_LABEL[m]}
              </button>
            ))}
          </div>
        </div>

        {settings.isLoading && <p className="text-sm text-slate-500">Ładowanie ustawień…</p>}
        {settings.isError && <p className="text-sm text-red-600">Nie udało się pobrać ustawień modułu.</p>}

        {threshold !== null && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="calibration-threshold" className="text-sm font-medium">
                Próg decyzyjny
              </label>
              <output htmlFor="calibration-threshold" className="text-2xl font-semibold tabular-nums">
                {threshold.toFixed(2)}
              </output>
            </div>
            <input
              id="calibration-threshold"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={threshold}
              onChange={(e) => changeThreshold(Number(e.target.value))}
              className="w-full accent-slate-900"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-slate-600">
                Zapisany próg: <span className="font-semibold tabular-nums">{saved?.toFixed(2)}</span>
                {" · "}
                bieżący: <span className="font-semibold tabular-nums">{threshold.toFixed(2)}</span>
                {dirty ? (
                  <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">niezapisane zmiany</span>
                ) : (
                  <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">zgodny z zapisanym</span>
                )}
              </p>
              <button
                type="button"
                onClick={() => save.mutate(threshold)}
                disabled={save.isPending || !dirty}
                className="rounded-md bg-slate-900 px-4 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {save.isPending ? "Zapisywanie…" : "Zapisz próg"}
              </button>
            </div>
            <div aria-live="polite" className="text-sm">
              {save.isSuccess && <p className="text-emerald-700">Próg został zapisany.</p>}
              {save.isError && <p className="text-red-600">Nie udało się zapisać progu.</p>}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        {evalQuery.isLoading && <p className="text-sm text-slate-500">Ładowanie wyników ewaluacji…</p>}
        {evalQuery.isError && <p className="text-sm text-red-600">Nie udało się pobrać wyników ewaluacji.</p>}
        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Tile label="Precyzja" value={percent(data.precision)} />
              <Tile label="Czułość" value={percent(data.recall)} />
              <Tile label="F1" value={percent(f1(data.precision, data.recall))} />
              <Tile label="FP" value={String(data.fp)} hint="fałszywe alarmy" />
              <Tile label="FN" value={String(data.fn)} hint="pominięte naruszenia" />
            </div>
            <table className="w-full max-w-sm border-collapse text-center text-sm">
              <caption className="pb-1 text-left text-xs uppercase text-slate-500">Macierz pomyłek</caption>
              <thead>
                <tr>
                  <th className="border border-slate-200 p-2" />
                  <th className="border border-slate-200 p-2 font-medium">Flaga</th>
                  <th className="border border-slate-200 p-2 font-medium">Brak flagi</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th className="border border-slate-200 p-2 font-medium">Naruszenie</th>
                  <td className="border border-slate-200 bg-emerald-50 p-2 tabular-nums">TP: {data.tp}</td>
                  <td className="border border-slate-200 bg-red-50 p-2 tabular-nums">FN: {data.fn}</td>
                </tr>
                <tr>
                  <th className="border border-slate-200 p-2 font-medium">Brak naruszenia</th>
                  <td className="border border-slate-200 bg-red-50 p-2 tabular-nums">FP: {data.fp}</td>
                  <td className="border border-slate-200 bg-emerald-50 p-2 tabular-nums">TN: {data.tn}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
        {threshold !== null && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase text-slate-500">Wyników na liście przy tym progu</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{resultsCount}</p>
            <p className="mt-1 text-xs text-slate-500">{MODULE_LABEL[module]}, score ≥ {threshold.toFixed(2)}</p>
          </div>
        )}
      </section>
    </div>
  );
}
