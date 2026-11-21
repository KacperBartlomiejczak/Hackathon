import { criterionLabel, verdictLabel } from "@/lib/utils";
import type { FindingDetails } from "@/types";

export function ReasonsCard({ finding }: { finding: FindingDetails }) {
  return (
    <section className="rounded-lg border border-line bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Dlaczego oznaczono</h2>
      <ul className="space-y-3">
        {finding.reasons.map((r, i) => (
          <li key={`${r.criterion}-${i}`} className="border-l-4 border-red-400 pl-3">
            <p className="text-sm font-medium">
              {criterionLabel(r.criterion)} <span className="text-slate-500">· {verdictLabel(r.verdict)} · waga {r.weight}</span>
            </p>
            <blockquote className="mt-1 text-sm italic text-slate-700">„{r.quote}”</blockquote>
          </li>
        ))}
      </ul>
      <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-line-soft pt-3 text-sm">
        <dt className="text-slate-500">Firma</dt>
        <dd>{finding.firm?.name ?? "—"}</dd>
        <dt className="text-slate-500">Reklamujący</dt>
        <dd>{finding.advertiser?.name ?? "—"}</dd>
        <dt className="text-slate-500">Model</dt>
        <dd>
          {finding.model} · {finding.promptVersion}
        </dd>
      </dl>
    </section>
  );
}
