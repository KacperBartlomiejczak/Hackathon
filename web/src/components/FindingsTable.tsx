import { Link } from "react-router-dom";
import { RiskBadge, StatusBadge } from "@/components/Badges";
import { formatDate, MODULE_LABEL, sourceLabel } from "@/lib/utils";
import type { FindingListItem } from "@/types";

export function FindingsTable({ items }: { items: FindingListItem[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-card">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line bg-head text-xs uppercase text-slate-500">
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
          {items.map((f) => (
            <tr key={f.id} className="border-b border-line-soft last:border-0 hover:bg-head">
              <td className="px-4 py-3">
                <Link to={`/findings/${f.id}`} className="text-blue-700 hover:underline">
                  {formatDate(f.createdAt)}
                </Link>
              </td>
              <td className="px-4 py-3">{MODULE_LABEL[f.module]}</td>
              <td className="px-4 py-3">
                <RiskBadge level={f.riskLevel} />
              </td>
              <td className="px-4 py-3">{sourceLabel(f.document.sourceKind)}</td>
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
  );
}
