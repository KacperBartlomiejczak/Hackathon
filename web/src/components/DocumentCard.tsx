import { formatDate, sourceLabel } from "@/lib/utils";
import type { DocumentInfo } from "@/types";

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

interface DocumentCardProps {
  document: DocumentInfo;
  quotes: string[];
}

export function DocumentCard({ document, quotes }: DocumentCardProps) {
  return (
    <section className="rounded-lg border border-line bg-card p-4 text-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Dokument</h2>
      <p>
        <a href={document.url} target="_blank" rel="noreferrer" className="break-all text-blue-700 hover:underline">
          {document.url}
        </a>
      </p>
      <p className="mt-1 text-slate-500">
        {sourceLabel(document.sourceKind)} · pobrano {formatDate(document.fetchedAt)}
      </p>
      {document.textClean && (
        <p className="mt-3 whitespace-pre-wrap leading-relaxed">
          <Highlighted text={document.textClean} quotes={quotes} />
        </p>
      )}
      {document.screenshotUrl ? (
        <img src={document.screenshotUrl} alt="Zrzut ekranu" className="mt-3 max-w-full rounded border" />
      ) : (
        <p className="mt-3 text-xs text-slate-400">Brak zrzutu ekranu.</p>
      )}
    </section>
  );
}
