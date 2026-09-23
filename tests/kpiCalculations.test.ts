import { describe, expect, it } from "vitest";
import { calculateKpis, recalculateRows } from "../src/lib/domain/kpiCalculations";
import { makeRow } from "./testRows";

describe("KPI calculations", () => {
  it("shows recovered revenue after replenishment", () => {
    const rows = recalculateRows([makeRow({ systemRecommendedQty: 24, finalQty: 24 })]);
    const kpis = calculateKpis(rows, true);

    expect(kpis.replenishmentUnits).toBe(24);
    expect(kpis.recoveredRevenue).toBeGreaterThan(0);
    expect(kpis.lostSalesValue).toBeLessThan(calculateKpis(rows, false).lostSalesValue);
  });

  it("calculates OOS risk as demand-weighted unfulfilled forecast units", () => {
    const rows = recalculateRows([
      makeRow({ id: "high-demand", forecastNext14: 100, stockOnHand: 50, inTransitQty: 0, finalQty: 0 }),
      makeRow({ id: "low-demand", forecastNext14: 10, stockOnHand: 0, inTransitQty: 0, finalQty: 0 })
    ]);

    const current = calculateKpis(rows, false);
    const simulation = calculateKpis(
      recalculateRows(rows.map((row) => (row.id === "high-demand" ? { ...row, finalQty: 20 } : row))),
      true
    );

    expect(current.oosPercent).toBe(54.5);
    expect(simulation.oosPercent).toBe(36.4);
  });
});
