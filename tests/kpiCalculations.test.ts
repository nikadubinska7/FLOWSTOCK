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
});
