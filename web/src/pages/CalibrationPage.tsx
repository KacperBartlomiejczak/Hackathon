import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EvalMetrics } from "@/components/EvalMetrics";
import { ModuleTabs } from "@/components/ModuleTabs";
import { ThresholdControl } from "@/components/ThresholdControl";
import { DemoBadge } from "@/components/DemoBadge";
import { QueryState } from "@/components/QueryState";
import { isMocked, fetchEval, fetchModuleSettings, saveModuleSettings } from "@/lib/api";
import { MODULE_LABEL } from "@/lib/utils";
import { mockFindings } from "@/mocks";
import type { ModuleId } from "@/types";

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
    if (!isMocked("eval") || threshold === null) return 0;
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
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Kalibracja</h1>
        <DemoBadge endpoints={["eval", "settings"]} />
      </div>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <ModuleTabs value={module} onChange={changeModule} />

        <QueryState isLoading={settings.isLoading} isError={settings.isError} errorMessage="Nie udało się pobrać ustawień modułu." loadingMessage="Ładowanie ustawień…" onRetry={() => void settings.refetch()} />

        {threshold !== null && (
          <ThresholdControl
            threshold={threshold}
            saved={saved}
            dirty={dirty}
            saving={save.isPending}
            saveSucceeded={save.isSuccess}
            saveFailed={save.isError}
            onChange={changeThreshold}
            onSave={() => save.mutate(threshold)}
          />
        )}
      </section>

      <section className="space-y-3">
        <QueryState isLoading={evalQuery.isLoading} isError={evalQuery.isError} errorMessage="Nie udało się pobrać wyników ewaluacji." loadingMessage="Ładowanie wyników ewaluacji…" onRetry={() => void evalQuery.refetch()} />
        {data && <EvalMetrics data={data} />}
        {isMocked("eval") && threshold !== null && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase text-slate-500">Wyników na liście przy tym progu</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{resultsCount}</p>
            <p className="mt-1 text-xs text-slate-500">
              {MODULE_LABEL[module]}, score ≥ {threshold.toFixed(2)}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
