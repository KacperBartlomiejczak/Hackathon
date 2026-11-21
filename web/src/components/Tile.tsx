interface TileProps {
  label: string;
  value: string | number;
  hint?: string;
  tone?: string;
}

export function Tile({ label, value, hint, tone }: TileProps) {
  return (
    <div className="rounded-lg border border-line border-l-[3px] border-l-brand bg-card p-4">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${tone ?? ""}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
