import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchSources, runSource } from "@/lib/api";
import { cn, formatDate, MODULE_LABEL } from "@/lib/utils";
import type { CrawlStatus, SourceKind } from "@/types";

const KIND_LABEL: Record<SourceKind, string> = {
  web: "Strona WWW",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  sample: "Dane przykładowe",
};

const CRAWL_LABEL: Record<CrawlStatus, string> = {
  running: "W toku",
  ok: "OK",
  partial: "Częściowo",
  failed: "Błąd",
};

const CRAWL_STYLE: Record<CrawlStatus, string> = {
  running: "bg-blue-100 text-blue-700",
  ok: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
};

function CrawlBadge({ status }: { status: CrawlStatus }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", CRAWL_STYLE[status])}>
      {status === "running" && <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-blue-600" />}
      {CRAWL_LABEL[status]}
    </span>
  );
}

export default function SourcesPage() {
  const queryClient = useQueryClient();

  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: fetchSources,
    refetchInterval: (query) => (query.state.data?.some((s) => s.lastRun?.status === "running") ? 2000 : false),
  });

  const run = useMutation({
    mutationFn: runSource,
    onSuccess: () => {
      toast.success("Uruchomiono crawl");
      void queryClient.invalidateQueries({ queryKey: ["sources"] });
    },
    onError: () => toast.error("Nie udało się uruchomić crawla"),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Źródła</h1>

      {sources.isLoading && <p className="text-sm text-slate-500">Ładowanie…</p>}
      {sources.isError && <p className="text-sm text-red-600">Nie udało się pobrać źródeł.</p>}
      {sources.data && sources.data.length === 0 && <p className="text-sm text-slate-500">Brak skonfigurowanych źródeł.</p>}

      {sources.data && sources.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Źródło</th>
                <th className="px-4 py-3">Rodzaj</th>
                <th className="px-4 py-3">Moduł</th>
                <th className="px-4 py-3">Harmonogram</th>
                <th className="px-4 py-3">Ostatni crawl</th>
                <th className="px-4 py-3">Znaleziono</th>
                <th className="px-4 py-3">Czas</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sources.data.map((s) => {
                const status = s.lastRun?.status;
                const busy = status === "running" || (run.isPending && run.variables === s.id);
                return (
                  <tr key={s.id} className={cn("align-top", !s.enabled && "text-slate-400")}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{s.name}</p>
                      <p className="max-w-xs truncate text-xs text-slate-500">{s.startUrl}</p>
                      {!s.enabled && <p className="text-xs">Wyłączone</p>}
                    </td>
                    <td className="px-4 py-3">{KIND_LABEL[s.kind]}</td>
                    <td className="px-4 py-3">{s.moduleHint ? MODULE_LABEL[s.moduleHint] : "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{s.cron ?? "ręcznie"}</td>
                    <td className="px-4 py-3">
                      {s.lastRun ? <CrawlBadge status={s.lastRun.status} /> : <span className="text-slate-500">Brak uruchomień</span>}
                      {s.lastRun?.error && <p className="mt-1 max-w-xs text-xs text-red-600">{s.lastRun.error}</p>}
                    </td>
                    <td className="px-4 py-3">{s.lastRun?.itemsFound ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">
                      {s.lastRun ? formatDate(s.lastRun.finishedAt ?? s.lastRun.startedAt) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run.mutate(s.id)}
                        className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busy ? "Trwa…" : "Uruchom crawl"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
