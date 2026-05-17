import type { ConstraintStatus, RiskLevel } from "@/lib/domain/types";
import { Badge } from "@/components/common/Badge";

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  if (risk === "Blocked") return <span className="inline-flex items-center gap-2 rounded-full border border-violet-300/30 bg-violet-400/13 px-3 py-1 text-xs font-semibold text-violet-100"><span className="h-2 w-2 rounded-full bg-violet-300 shadow-[0_0_14px_rgba(196,181,253,0.6)]" />Blocked</span>;
  if (risk === "High") return <span className="inline-flex items-center gap-2 rounded-full border border-rose-300/30 bg-rose-400/13 px-3 py-1 text-xs font-semibold text-rose-100"><span className="h-2 w-2 rounded-full bg-rose-300 shadow-[0_0_14px_rgba(251,113,133,0.6)]" />High</span>;
  if (risk === "Medium") return <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/13 px-3 py-1 text-xs font-semibold text-amber-100"><span className="h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_14px_rgba(245,158,11,0.55)]" />Medium</span>;
  return <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/12 px-3 py-1 text-xs font-semibold text-emerald-100"><span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(52,211,153,0.5)]" />Low</span>;
}

export function ConstraintBadge({ status }: { status: ConstraintStatus }) {
  if (status === "Blocked") return <Badge tone="red">Blocked</Badge>;
  if (status === "Warning") return <Badge tone="amber">Warning</Badge>;
  return <Badge tone="green">Valid</Badge>;
}
