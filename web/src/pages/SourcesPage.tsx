import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SourcesTable } from "@/components/SourcesTable";
import { fetchSources, runSource } from "@/lib/api";

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
        <SourcesTable sources={sources.data} pendingId={run.isPending ? run.variables : undefined} onRun={(id) => run.mutate(id)} />
      )}
    </div>
  );
}
