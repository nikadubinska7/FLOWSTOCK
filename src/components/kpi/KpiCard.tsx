"use client";

import { AlertTriangle, BadgeEuro, CheckCircle2, CircleDollarSign, Gauge, Info, PackageCheck, Shield, Warehouse } from "lucide-react";
import { useState } from "react";
import { DeltaBadge } from "@/components/kpi/DeltaBadge";

export type KpiExplanation = {
  name: string;
  meaning: string;
  formula: string;
  basis: string;
  interpretation: string;
};

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
  deltaValue = 0,
  inverse,
  explanation
}: {
  label: string;
  value: string;
  detail?: string;
  delta?: string;
  deltaValue?: number;
  inverse?: boolean;
  explanation?: KpiExplanation;
}) {
  const icon = iconForLabel(label);
  const [open, setOpen] = useState(false);
  return (
    <div
      className="group relative min-h-[154px] rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.075] to-white/[0.025] p-5 shadow-cockpit transition duration-200 hover:-translate-y-0.5 hover:border-blue-300/25 hover:bg-blue-400/[0.055]"
      onMouseLeave={() => setOpen(false)}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-cockpit-muted">{label}</p>
          {explanation ? (
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              onMouseEnter={() => setOpen(true)}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              className="rounded-full text-cockpit-muted transition hover:text-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300/40"
              aria-label={`Explain ${label}`}
            >
              <Info size={14} />
            </button>
          ) : null}
        </div>
        {delta ? <DeltaBadge value={delta} change={deltaValue} inverse={inverse} /> : null}
      </div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-4xl font-semibold leading-none text-cockpit-text">{value}</div>
          {detail ? <p className="mt-3 text-sm text-cockpit-muted">{detail}</p> : null}
        </div>
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ${icon.className}`}>{icon.icon}</div>
      </div>
      {explanation ? (
        <div
          className={`${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0 group-hover:opacity-100"} absolute bottom-[calc(100%-0.75rem)] left-4 right-4 z-30 rounded-2xl border border-cyan-200/20 bg-[#071224]/95 p-4 text-xs leading-5 text-cockpit-muted shadow-[0_22px_60px_rgba(2,6,23,0.75),0_0_34px_rgba(34,211,238,0.12)] backdrop-blur-xl transition`}
        >
          <p className="mb-2 text-sm font-semibold text-cockpit-text">{explanation.name}</p>
          <p>{explanation.meaning}</p>
          <p className="mt-2"><span className="font-semibold text-cyan-100">Formula:</span> {explanation.formula}</p>
          <p className="mt-2"><span className="font-semibold text-cyan-100">Basis:</span> {explanation.basis}</p>
          <p className="mt-2"><span className="font-semibold text-cyan-100">Read it as:</span> {explanation.interpretation}</p>
        </div>
      ) : null}
    </div>
  );
}
