import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { RiskBadge, StatusBadge } from "@/components/Badges";
import { fetchFindings } from "@/lib/api";
import { formatDate, MODULE_LABEL } from "@/lib/utils";

export default function FindingsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["findings"],
    queryFn: () => fetchFindings({}),
  });

  if (isLoading) return <p className="text-sm text-slate-500">Ładowanie…</p>;
  if (isError || !data) return <p className="text-sm text-red-600">Nie udało się pobrać findingów.</p>;
  if (data.items.length === 0) return <p className="text-sm text-slate-500">Brak findingów.</p>;

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Findingi</h1>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Moduł</th>
              <th className="px-4 py-3">Ryzyko</th>
              <th className="px-4 py-3">Źródło</th>
              <th className="px-4 py-3">Firma</th>
              <th className="px-4 py-3">Reklamujący</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((f) => (
              <tr key={f.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link to={`/findings/${f.id}`} className="text-blue-700 hover:underline">
                    {formatDate(f.createdAt)}
                  </Link>
                </td>
                <td className="px-4 py-3">{MODULE_LABEL[f.module]}</td>
                <td className="px-4 py-3">
                  <RiskBadge level={f.riskLevel} />
                </td>
                <td className="px-4 py-3">{f.document.sourceKind}</td>
                <td className="px-4 py-3">{f.firm?.name ?? "—"}</td>
                <td className="px-4 py-3">{f.advertiser?.name ?? "—"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={f.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
