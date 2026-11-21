import { MODULE_LABEL } from "@/lib/utils";
import type { ModuleId } from "@/types";

interface ModuleSelectProps {
  value: ModuleId | undefined;
  onChange: (module: ModuleId | undefined) => void;
}

export function ModuleSelect({ value, onChange }: ModuleSelectProps) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? (Number(e.target.value) as ModuleId) : undefined)}
      className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
    >
      <option value="">Wszystkie moduły</option>
      {([1, 2, 3] as ModuleId[]).map((m) => (
        <option key={m} value={m}>
          {MODULE_LABEL[m]}
        </option>
      ))}
    </select>
  );
}
