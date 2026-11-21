import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { RiskBadge, StatusBadge } from "@/components/Badges";
import { fetchFinding, updateFindingStatus } from "@/lib/api";
import { formatDate, MODULE_LABEL, STATUS_LABEL } from "@/lib/utils";
import type { FindingStatus } from "@/types";

function Highlighted({ text, quotes }: { text: string; quotes: string[] }) {
  const valid = quotes.filter((q) => q && text.includes(q));
  if (valid.length === 0) return <>{text}</>;
  const escaped = valid.map((q) => q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "g"));
  return (
    <>
      {parts.map((part, i) =>
        valid.includes(part) ? (
          <mark key={i} className="rounded bg-red-100 px-0.5 text-red-900">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

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
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Zmień status
          <select
            value={data.status}
            disabled={mutation.isPending}
            onChange={(e) => mutation.mutate(e.target.value as FindingStatus)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            {(Object.keys(STATUS_LABEL) as FindingStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {mutation.isError && <p className="text-sm text-red-600">Nie udało się zmienić statusu.</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Dlaczego oznaczono</h2>
          <ul className="space-y-3">
            {data.reasons.map((r) => (
              <li key={r.criterion} className="border-l-4 border-red-400 pl-3">
                <p className="text-sm font-medium">
                  {r.criterion} <span className="text-slate-500">· {r.verdict} · waga {r.weight}</span>
                </p>
                <blockquote className="mt-1 text-sm italic text-slate-700">„{r.quote}”</blockquote>
              </li>
            ))}
          </ul>
          <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-sm">
            <dt className="text-slate-500">Firma</dt>
            <dd>{data.firm?.name ?? "—"}</dd>
            <dt className="text-slate-500">Reklamujący</dt>
            <dd>{data.advertiser?.name ?? "—"}</dd>
            <dt className="text-slate-500">Model</dt>
            <dd>
              {data.model} · {data.promptVersion}
            </dd>
          </dl>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Dokument</h2>
          <p>
            <a href={data.document.url} target="_blank" rel="noreferrer" className="break-all text-blue-700 hover:underline">
              {data.document.url}
            </a>
          </p>
          <p className="mt-1 text-slate-500">
            {data.document.sourceKind} · pobrano {formatDate(data.document.fetchedAt)}
          </p>
          {data.document.textClean && (
            <p className="mt-3 whitespace-pre-wrap leading-relaxed">
              <Highlighted text={data.document.textClean} quotes={quotes} />
            </p>
          )}
          {data.document.screenshotUrl ? (
            <img src={data.document.screenshotUrl} alt="Zrzut ekranu" className="mt-3 max-w-full rounded border" />
          ) : (
            <p className="mt-3 text-xs text-slate-400">Brak zrzutu ekranu.</p>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Historia statusów</h2>
        {data.history.length === 0 ? (
          <p className="text-slate-400">Brak zmian.</p>
        ) : (
          <ul className="space-y-1">
            {data.history.map((h, i) => (
              <li key={i}>
                {formatDate(h.changedAt)} · {h.oldStatus ? STATUS_LABEL[h.oldStatus] : "—"} → {STATUS_LABEL[h.newStatus]}
                {h.changedBy ? ` · ${h.changedBy}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
