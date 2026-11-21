import { cn, RISK_LABEL, STATUS_LABEL } from "@/lib/utils";
import type { FindingStatus, RiskLevel } from "@/types";

const riskStyles: Record<RiskLevel, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-emerald-100 text-emerald-800",
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", riskStyles[level])}>
      {RISK_LABEL[level]}
    </span>
  );
}

export function StatusBadge({ status }: { status: FindingStatus }) {
  return (
    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
      {STATUS_LABEL[status]}
    </span>
  );
}
