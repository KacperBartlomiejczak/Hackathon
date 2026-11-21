import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { RiskBadge, StatusBadge } from "@/components/Badges";
import { DocumentCard } from "@/components/DocumentCard";
import { ReasonsCard } from "@/components/ReasonsCard";
import { StatusHistory } from "@/components/StatusHistory";
import { DemoBadge } from "@/components/DemoBadge";
import { StatusSelect } from "@/components/StatusSelect";
import { fetchFinding, updateFindingStatus } from "@/lib/api";
import { MODULE_LABEL } from "@/lib/utils";
import type { FindingStatus } from "@/types";

export default function FindingDetailsPage() {
  const { id } = useParams();
  const numericId = Number(id);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["finding", numericId],
    queryFn: () => fetchFinding(numericId),
  });

  const mutation = useMutation({
    mutationFn: (status: FindingStatus) => updateFindingStatus(numericId, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finding", numericId] });
      void queryClient.invalidateQueries({ queryKey: ["findings"] });
    },
  });

  if (isLoading) return <p className="text-sm text-slate-500">Ładowanie…</p>;
  if (isError || !data) return <p className="text-sm text-red-600">Nie znaleziono findingu.</p>;

  const quotes = data.reasons.map((r) => r.quote);

  return (
    <div className="space-y-6">
      <Link to="/findings" className="text-sm text-blue-700 hover:underline">
        ← Wróć do listy
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{MODULE_LABEL[data.module]}</h1>
          <RiskBadge level={data.riskLevel} />
          <StatusBadge status={data.status} />
          <span className="text-sm text-slate-500">score {data.score.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-3">
          <DemoBadge endpoints={["status"]} />
          <StatusSelect value={data.status} disabled={mutation.isPending} onChange={(s) => mutation.mutate(s)} />
        </div>
      </div>
      {mutation.isError && <p className="text-sm text-red-600">Nie udało się zmienić statusu.</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <ReasonsCard finding={data} />
        <DocumentCard document={data.document} quotes={quotes} />
      </div>

      <StatusHistory history={data.history} />
    </div>
  );
}
