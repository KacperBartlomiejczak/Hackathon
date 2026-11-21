import { formatDate, STATUS_LABEL } from "@/lib/utils";
import type { StatusHistoryEntry } from "@/types";

export function StatusHistory({ history }: { history: StatusHistoryEntry[] }) {
  return (
    <section className="rounded-lg border border-line bg-card p-4 text-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Historia statusów</h2>
      {history.length === 0 ? (
        <p className="text-slate-400">Brak zmian.</p>
      ) : (
        <ul className="space-y-1">
          {history.map((h, i) => (
            <li key={i}>
              {formatDate(h.changedAt)} · {h.oldStatus ? STATUS_LABEL[h.oldStatus] : "—"} → {STATUS_LABEL[h.newStatus]}
              {h.changedBy ? ` · ${h.changedBy}` : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
