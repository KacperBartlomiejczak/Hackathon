import { STATUS_LABEL } from "@/lib/utils";
import type { FindingStatus } from "@/types";

interface StatusSelectProps {
  value: FindingStatus;
  disabled: boolean;
  onChange: (status: FindingStatus) => void;
}

export function StatusSelect({ value, disabled, onChange }: StatusSelectProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      Zmień status
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as FindingStatus)}
        className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
      >
        {(Object.keys(STATUS_LABEL) as FindingStatus[]).map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </label>
  );
}
