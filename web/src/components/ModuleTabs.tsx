import { MODULE_LABEL } from "@/lib/utils";
import type { ModuleId } from "@/types";

const MODULES: ModuleId[] = [1, 2, 3];

interface ModuleTabsProps {
  value: ModuleId;
  onChange: (module: ModuleId) => void;
}

export function ModuleTabs({ value, onChange }: ModuleTabsProps) {
  return (
    <div role="tablist" aria-label="Moduł" className="flex gap-1 rounded-md bg-slate-100 p-1">
      {MODULES.map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={m === value}
          onClick={() => onChange(m)}
          className={`rounded px-3 py-1.5 text-sm ${m === value ? "bg-white font-semibold shadow-sm" : "text-slate-600"}`}
        >
          {MODULE_LABEL[m]}
        </button>
      ))}
    </div>
  );
}
