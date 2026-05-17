import { BarChart3, ChevronRight, LifeBuoy, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import type { ScenarioKey } from "@/lib/domain/types";

export function ScenarioButtons({
  activeScenario,
  loading,
  onRun
}: {
  activeScenario: string;
  loading: boolean;
  onRun: (scenario: ScenarioKey) => void;
}) {
  const buttons: Array<{
    key: ScenarioKey;
    label: string;
    icon: ReactNode;
    text: string;
    color: string;
    iconColor: string;
    active: string;
  }> = [
    {
      key: "inventory",
      label: "Lean Replenishment",
      icon: <ShieldCheck size={24} />,
      text: "Send the minimum stock needed to protect availability and avoid excess.",
      color: "border-cyan-300/30 bg-cyan-400/10 hover:bg-cyan-400/16 hover:border-cyan-300/50",
      iconColor: "bg-cyan-400/16 text-cyan-200 ring-cyan-300/25",
      active: "border-cyan-300/70 bg-cyan-400/18 shadow-[0_18px_46px_rgba(34,211,238,0.18)]"
    },
    {
      key: "lostSales",
      label: "Lost Sales Recovery",
      icon: <LifeBuoy size={24} />,
      text: "Prioritize revenue and margin at risk",
      color: "border-rose-300/30 bg-rose-400/10 hover:bg-rose-400/16 hover:border-rose-300/50",
      iconColor: "bg-rose-400/16 text-rose-200 ring-rose-300/25",
      active: "border-rose-300/70 bg-rose-400/18 shadow-[0_18px_46px_rgba(244,63,94,0.18)]"
    },
    {
      key: "optimal",
      label: "Optimal Recommendation",
      icon: <BarChart3 size={24} />,
      text: "Balanced margin, service, and capacity",
      color: "border-blue-300/35 bg-blue-500/12 hover:bg-blue-500/18 hover:border-blue-300/60",
      iconColor: "bg-blue-500/18 text-blue-200 ring-blue-300/25",
      active: "border-blue-300/75 bg-blue-500/22 shadow-[0_18px_46px_rgba(37,99,235,0.28)]"
    }
  ];

  return (
    <section className="glass-panel-strong rounded-3xl p-7">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/18 text-blue-200 ring-1 ring-blue-300/25 shadow-[0_0_36px_rgba(37,99,235,0.2)]">
              <Sparkles size={22} />
            </span>
            <h2 className="text-2xl font-semibold text-cockpit-text">Smart Replenishment</h2>
          </div>
          <p className="max-w-3xl text-sm text-cockpit-muted">Choose the planning strategy. The system calculates quantities, reasons, constraints, and projected impact.</p>
        </div>
        <span className="shrink-0 rounded-full border border-blue-300/25 bg-blue-400/10 px-3 py-1 text-xs font-semibold text-blue-100">{activeScenario || "No scenario run"}</span>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {buttons.map((button) => (
          <button
            key={button.key}
            type="button"
            disabled={loading}
            onClick={() => onRun(button.key)}
            className={`group flex min-h-[146px] items-center justify-between gap-4 rounded-2xl border p-6 text-left transition duration-200 disabled:cursor-not-allowed disabled:opacity-45 ${
              activeScenario === button.label ? button.active : button.color
            }`}
          >
            <span className="flex min-w-0 items-start gap-3">
              <span className={`mt-0.5 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ring-1 ${button.iconColor}`}>{button.icon}</span>
              <span>
                <span className="block text-lg font-semibold text-cockpit-text">{button.label}</span>
                <span className="mt-2 block text-sm font-normal leading-relaxed text-cockpit-muted">{button.text}</span>
                {activeScenario === button.label ? (
                  <span className="mt-4 inline-flex rounded-full border border-white/10 bg-white/[0.08] px-2.5 py-1 text-xs font-semibold text-cockpit-text">Active scenario</span>
                ) : null}
              </span>
            </span>
            <ChevronRight size={20} className="shrink-0 text-cockpit-muted transition group-hover:translate-x-0.5 group-hover:text-cockpit-text" />
          </button>
        ))}
      </div>
    </section>
  );
}
