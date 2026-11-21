import type { ReactNode } from "react";
import type { ExportFormat } from "@/lib/exportFormat";
import { MODULE_LABEL, RISK_LABEL, STATUS_LABEL } from "@/lib/utils";
import type { FindingStatus, ModuleId, RiskLevel, SourceKind } from "@/types";

const SOURCES: SourceKind[] = ["web", "facebook", "instagram", "tiktok", "youtube", "sample"];
const fieldClass = "rounded-md border border-line bg-card px-2 py-1.5 text-sm";

export type FilterKey = "q" | "module" | "risk" | "status" | "source" | "from" | "to";

interface FiltersBarProps {
  values: Record<FilterKey, string>;
  hasFilters: boolean;
  onChange: (key: FilterKey, value: string) => void;
  onClear: () => void;
  exporting: boolean;
  exportDisabled: boolean;
  exportError: boolean;
  onExport: (format: ExportFormat) => void;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-500">
      {label}
      {children}
    </label>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

function SelectField({ label, value, options, onChange }: SelectFieldProps) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass}>
        <option value="">Wszystkie</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function FiltersBar({ values, hasFilters, onChange, onClear, exporting, exportDisabled, exportError, onExport }: FiltersBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-card p-3">
      <Field label="Szukaj">
        <input
          type="search"
          value={values.q}
          onChange={(e) => onChange("q", e.target.value)}
          placeholder="Treść, firma, URL…"
          className={`${fieldClass} w-52`}
        />
      </Field>
      <SelectField
        label="Moduł"
        value={values.module}
        onChange={(v) => onChange("module", v)}
        options={([1, 2, 3] as ModuleId[]).map((m) => ({ value: String(m), label: MODULE_LABEL[m] }))}
      />
      <SelectField
        label="Ryzyko"
        value={values.risk}
        onChange={(v) => onChange("risk", v)}
        options={(Object.keys(RISK_LABEL) as RiskLevel[]).map((r) => ({ value: r, label: RISK_LABEL[r] }))}
      />
      <SelectField
        label="Status"
        value={values.status}
        onChange={(v) => onChange("status", v)}
        options={(Object.keys(STATUS_LABEL) as FindingStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
      />
      <SelectField
        label="Źródło"
        value={values.source}
        onChange={(v) => onChange("source", v)}
        options={SOURCES.map((s) => ({ value: s, label: s }))}
      />
      <Field label="Od">
        <input type="date" value={values.from} onChange={(e) => onChange("from", e.target.value)} className={fieldClass} />
      </Field>
      <Field label="Do">
        <input type="date" value={values.to} onChange={(e) => onChange("to", e.target.value)} className={fieldClass} />
      </Field>
      {hasFilters && (
        <button type="button" onClick={onClear} className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-head">
          Wyczyść filtry
        </button>
      )}
      <div className="ml-auto flex items-center gap-2">
        {(["csv", "json"] as ExportFormat[]).map((format) => (
          <button
            key={format}
            type="button"
            disabled={exporting || exportDisabled}
            onClick={() => onExport(format)}
            className="rounded-md border border-line bg-card px-3 py-1.5 text-sm disabled:opacity-40"
          >
            {format === "csv" ? "Eksport CSV" : "Eksport JSON"}
          </button>
        ))}
      </div>
      {exportError && <p className="w-full text-sm text-red-600">Nie udało się wyeksportować danych.</p>}
    </div>
  );
}
