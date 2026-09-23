import type { Kpis } from "@/lib/domain/types";
import { money, pct, stockCompact, whole } from "@/lib/utils/formatters";
import { KpiCard, type KpiExplanation } from "@/components/kpi/KpiCard";

function signed(value: number, suffix = "") {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}${suffix}`;
}

function explanations(isCurrent: boolean): Record<string, KpiExplanation> {
  const stockBasis = isCurrent
    ? "Current State uses stock on hand plus in-transit stock."
    : "Simulation uses stock on hand plus in-transit stock plus Final Qty.";
  return {
    inventory: {
      name: isCurrent ? "Inventory Value" : "Projected Inventory",
      meaning: "Total value of inventory in stores after the selected state.",
      formula: "sum(projected inventory units x unit cost)",
      basis: `${stockBasis} Flowstock uses cost value, not retail value, for this KPI.`,
      interpretation: "Higher inventory may protect availability, but it also ties up more stock value."
    },
    lostSales: {
      name: "Lost Sales Risk",
      meaning: "Estimated sales value that may be lost because forecast demand cannot be fulfilled.",
      formula: "sum(unfulfilled forecast units x selling price)",
      basis: `${stockBasis} The forecast horizon is 14 days. Recovery accounts for delivery timing with uniform daily demand; existing in-transit stock is assumed available.`,
      interpretation: "Lower is better. This is the money-based companion to OOS Risk."
    },
    oos: {
      name: "OOS Risk",
      meaning: "Percentage of forecast demand units projected to be unfulfilled within the planning horizon.",
      formula: "sum(unfulfilled forecast units) / sum(total forecast demand units) x 100",
      basis: `${stockBasis} Flowstock uses forecast next 14 days, the same horizon used for Lost Sales Risk.`,
      interpretation: "This is demand-weighted, so high-demand store-SKU rows have more impact than low-demand rows."
    },
    dcFreeStock: {
      name: "DC Free Stock",
      meaning: "Available distribution center stock that can still be used for replenishment.",
      formula: "DC total stock - reserved stock - blocked stock - DC safety stock",
      basis: isCurrent ? "Current available DC free stock before the plan." : "Remaining DC free stock after Final Qty allocations.",
      interpretation: "Higher free stock means more remaining flexibility. Lower free stock means more DC stock has been committed."
    }
  };
}

export function KpiPanel({ title, current, simulation }: { title: string; current: Kpis; simulation: Kpis }) {
  const isCurrent = title === "Current State";
  const kpis = isCurrent ? current : simulation;
  const kpiExplanations = explanations(isCurrent);
  return (
    <section className={`${isCurrent ? "glass-panel" : "glass-panel-strong"} rounded-3xl p-5`}>
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-cockpit-text">{title}</h2>
          <p className="mt-1 text-sm text-cockpit-muted">{isCurrent ? "Baseline before replenishment recommendation" : "Projected plan impact after recommendation and manual edits"}</p>
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
          deltaValue={kpis.inventoryValue - current.inventoryValue}
          inverse
          explanation={kpiExplanations.inventory}
        />
        <KpiCard
          label="Lost Sales Risk"
          value={money(kpis.lostSalesValue)}
          detail={isCurrent ? "Projected next 14 days" : `${money(kpis.recoveredRevenue)} revenue recovered`}
          delta={!isCurrent ? money(kpis.lostSalesValue - current.lostSalesValue) : undefined}
          deltaValue={kpis.lostSalesValue - current.lostSalesValue}
          inverse
          explanation={kpiExplanations.lostSales}
        />
        <KpiCard
          label="OOS Risk"
          value={pct(kpis.oosPercent)}
          detail={isCurrent ? "Demand-weighted next 14 days" : `${whole(kpis.improvedRows)} rows improved`}
          delta={!isCurrent ? signed(kpis.oosPercent - current.oosPercent, " pts") : undefined}
          deltaValue={kpis.oosPercent - current.oosPercent}
          inverse
          explanation={kpiExplanations.oos}
        />
        <KpiCard
          label="DC Free Stock"
          value={stockCompact(kpis.dcFreeStock)}
          detail={`${kpis.constraintViolations} blocked rows`}
          delta={!isCurrent ? stockCompact(kpis.dcFreeStock - current.dcFreeStock) : undefined}
          deltaValue={kpis.dcFreeStock - current.dcFreeStock}
          explanation={kpiExplanations.dcFreeStock}
        />
      </div>
    </section>
  );
}
