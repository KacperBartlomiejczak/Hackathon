import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { RiskBadge, StatusBadge } from "@/components/Badges";
import { fetchFinding } from "@/lib/api";
import { formatDate, MODULE_LABEL } from "@/lib/utils";

export default function FindingDetailsPage() {
  const { id } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["finding", id],
    queryFn: () => fetchFinding(Number(id)),
  });

  if (isLoading) return <p className="text-sm text-slate-500">Ładowanie…</p>;
  if (isError || !data) return <p className="text-sm text-red-600">Nie znaleziono findingu.</p>;

  return (
    <div className="space-y-6">
      <Link to="/findings" className="text-sm text-blue-700 hover:underline">
        ← Wróć do listy
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{MODULE_LABEL[data.module]}</h1>
        <RiskBadge level={data.riskLevel} />
        <StatusBadge status={data.status} />
        <span className="text-sm text-slate-500">score {data.score.toFixed(2)}</span>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Uzasadnienie</h2>
        <ul className="space-y-3">
          {data.reasons.map((r) => (
            <li key={r.criterion} className="border-l-4 border-red-400 pl-3">
              <p className="text-sm font-medium">
                {r.criterion} <span className="text-slate-500">({r.verdict})</span>
              </p>
              <blockquote className="mt-1 text-sm italic text-slate-700">„{r.quote}”</blockquote>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Dokument</h2>
        <p>
          <a href={data.document.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
            {data.document.url}
          </a>
        </p>
        <p className="mt-1 text-slate-500">Pobrano: {formatDate(data.document.fetchedAt)}</p>
        {data.document.textClean && <p className="mt-3 whitespace-pre-wrap">{data.document.textClean}</p>}
        {data.document.screenshotUrl && (
          <img src={data.document.screenshotUrl} alt="Zrzut ekranu" className="mt-3 max-w-full rounded border" />
        )}
      </section>
    </div>
  );
}
