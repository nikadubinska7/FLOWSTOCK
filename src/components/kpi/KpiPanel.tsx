import type { Kpis } from "@/lib/domain/types";
import { money, pct, stockCompact, whole } from "@/lib/utils/formatters";
import { KpiCard } from "@/components/kpi/KpiCard";

function signed(value: number, suffix = "") {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}${suffix}`;
}

export function KpiPanel({ title, current, simulation }: { title: string; current: Kpis; simulation: Kpis }) {
  const isCurrent = title === "Current State";
  const kpis = isCurrent ? current : simulation;
  return (
    <section className={`${isCurrent ? "glass-panel" : "glass-panel-strong"} rounded-3xl p-5`}>
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-cockpit-text">{title}</h2>
          <p className="mt-1 text-sm text-cockpit-muted">{isCurrent ? "Baseline before replenishment recommendation" : "Projected plan impact after scenario and manual edits"}</p>
        </div>
        <p className={`rounded-full border px-3 py-1 text-xs font-semibold ${isCurrent ? "border-white/10 bg-white/[0.045] text-cockpit-muted" : "border-cyan-300/25 bg-cyan-400/10 text-cyan-100"}`}>
          {isCurrent ? "Before recommendation" : "Live simulation"}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={isCurrent ? "Inventory Value" : "Projected Inventory"}
          value={money(kpis.inventoryValue)}
          detail={isCurrent ? "Current store stock value" : `Incremental replenishment: ${whole(kpis.replenishmentUnits)} units`}
          delta={!isCurrent ? money(kpis.inventoryValue - current.inventoryValue) : undefined}
        />
        <KpiCard
          label="Lost Sales Risk"
          value={money(kpis.lostSalesValue)}
          detail={isCurrent ? "Projected next 14 days" : `${money(kpis.recoveredRevenue)} revenue recovered`}
          delta={!isCurrent ? money(kpis.lostSalesValue - current.lostSalesValue) : undefined}
          inverse
        />
        <KpiCard
          label="OOS Risk"
          value={pct(kpis.oosPercent)}
          detail={`${whole(kpis.improvedRows)} rows improved`}
          delta={!isCurrent ? signed(kpis.oosPercent - current.oosPercent, " pts") : undefined}
          inverse
        />
        <KpiCard
          label="DC Free Stock"
          value={stockCompact(kpis.dcFreeStock)}
          detail={`${kpis.constraintViolations} blocked rows`}
          delta={!isCurrent ? stockCompact(kpis.dcFreeStock - current.dcFreeStock) : undefined}
          inverse
        />
      </div>
    </section>
  );
}
