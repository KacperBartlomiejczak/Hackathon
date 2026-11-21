interface ThresholdControlProps {
  threshold: number;
  saved: number | undefined;
  dirty: boolean;
  saving: boolean;
  saveSucceeded: boolean;
  saveFailed: boolean;
  onChange: (value: number) => void;
  onSave: () => void;
}

export function ThresholdControl({ threshold, saved, dirty, saving, saveSucceeded, saveFailed, onChange, onSave }: ThresholdControlProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="calibration-threshold" className="text-sm font-medium">
          Próg decyzyjny
        </label>
        <output htmlFor="calibration-threshold" className="text-2xl font-semibold tabular-nums">
          {threshold.toFixed(2)}
        </output>
      </div>
      <input
        id="calibration-threshold"
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={threshold}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand"
      />
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-slate-600">
          Zapisany próg: <span className="font-semibold tabular-nums">{saved?.toFixed(2)}</span>
          {" · "}
          bieżący: <span className="font-semibold tabular-nums">{threshold.toFixed(2)}</span>
          {dirty ? (
            <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">niezapisane zmiany</span>
          ) : (
            <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">zgodny z zapisanym</span>
          )}
        </p>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty}
          className="rounded-md bg-brand px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {saving ? "Zapisywanie…" : "Zapisz próg"}
        </button>
      </div>
      <div aria-live="polite" className="text-sm">
        {saveSucceeded && <p className="text-emerald-700">Próg został zapisany.</p>}
        {saveFailed && <p className="text-red-600">Nie udało się zapisać progu.</p>}
      </div>
    </div>
  );
}
