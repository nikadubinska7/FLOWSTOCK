import { AlertTriangle, BadgeEuro, CheckCircle2, CircleDollarSign, Gauge, PackageCheck, Shield, Warehouse } from "lucide-react";
import { DeltaBadge } from "@/components/kpi/DeltaBadge";

function RevenueProtectionIcon() {
  return (
    <span className="relative flex h-6 w-6 items-center justify-center">
      <Shield size={24} />
      <BadgeEuro size={13} className="absolute -bottom-1 -right-1 rounded-full bg-[#172033]" />
    </span>
  );
}

function iconForLabel(label: string) {
  if (label.includes("Lost")) return { icon: <RevenueProtectionIcon />, className: "bg-rose-500/15 text-rose-200 ring-rose-300/25 shadow-[0_0_34px_rgba(251,113,133,0.16)]" };
  if (label.includes("OOS")) return { icon: <AlertTriangle size={24} />, className: "bg-amber-400/15 text-amber-200 ring-amber-300/25 shadow-[0_0_34px_rgba(245,158,11,0.14)]" };
  if (label.includes("DC")) return { icon: <Warehouse size={24} />, className: "bg-cyan-400/15 text-cyan-200 ring-cyan-300/25 shadow-[0_0_34px_rgba(34,211,238,0.14)]" };
  if (label.includes("Inventory")) return { icon: <PackageCheck size={24} />, className: "bg-blue-500/18 text-blue-200 ring-blue-300/25 shadow-[0_0_34px_rgba(37,99,235,0.16)]" };
  if (label.includes("Margin")) return { icon: <CircleDollarSign size={24} />, className: "bg-emerald-400/15 text-emerald-200 ring-emerald-300/25 shadow-[0_0_34px_rgba(52,211,153,0.14)]" };
  if (label.includes("Valid")) return { icon: <CheckCircle2 size={24} />, className: "bg-emerald-400/15 text-emerald-200 ring-emerald-300/25 shadow-[0_0_34px_rgba(52,211,153,0.14)]" };
  return { icon: <Gauge size={24} />, className: "bg-blue-500/18 text-blue-200 ring-blue-300/25" };
}

export function KpiCard({
  label,
  value,
  detail,
  delta,
  inverse
}: {
  label: string;
  value: string;
  detail?: string;
  delta?: string;
  inverse?: boolean;
}) {
  const icon = iconForLabel(label);
  return (
    <div className="group min-h-[154px] rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.075] to-white/[0.025] p-5 shadow-cockpit transition duration-200 hover:-translate-y-0.5 hover:border-blue-300/25 hover:bg-blue-400/[0.055]">
      <div className="mb-5 flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-cockpit-muted">{label}</p>
        {delta ? <DeltaBadge value={delta} inverse={inverse} /> : null}
      </div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-4xl font-semibold leading-none text-cockpit-text">{value}</div>
          {detail ? <p className="mt-3 text-sm text-cockpit-muted">{detail}</p> : null}
        </div>
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ${icon.className}`}>{icon.icon}</div>
      </div>
    </div>
  );
}
