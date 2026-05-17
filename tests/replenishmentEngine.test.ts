import { describe, expect, it } from "vitest";
import { recommendRows } from "../src/lib/domain/replenishmentEngine";
import { makeRow } from "./testRows";

describe("replenishment engine", () => {
  it("creates a pack-multiple recommendation for low cover rows", () => {
    const [row] = recommendRows([makeRow()], "optimal");

    expect(row.systemRecommendedQty).toBeGreaterThan(0);
    expect(row.systemRecommendedQty % row.packMultiple).toBe(0);
    expect(row.finalQty).toBe(row.systemRecommendedQty);
    expect(row.reasonCode).toContain("Low days cover");
  });

  it("allocates scarce DC stock to the highest priority store first", () => {
    const rows = recommendRows(
      [
        makeRow({ id: "low", storeId: "STR001", dcFreeStock: 6, dcFreeStockOriginal: 6, storeSkuPriority: 0.5, marginAtRisk: 100 }),
        makeRow({ id: "high", storeId: "STR002", dcFreeStock: 6, dcFreeStockOriginal: 6, storeSkuPriority: 0.99, marginAtRisk: 1000 })
      ],
      "lostSales"
    );

    const high = rows.find((row) => row.id === "high");
    const low = rows.find((row) => row.id === "low");

    expect(high?.finalQty).toBe(6);
    expect(low?.finalQty).toBe(0);
    expect(low?.reasonCode).toContain("Blocked: no DC free stock");
  });

  it("allocates scarce DC stock to high-risk rows before lower-risk high-impact rows", () => {
    const rows = recommendRows(
      [
        makeRow({
          id: "medium-impact",
          storeId: "STR001",
          dcFreeStock: 6,
          dcFreeStockOriginal: 6,
          stockOnHand: 20,
          daysOfCover: 5,
          forecastNext7: 21,
          forecastNext14: 42,
          marginAtRisk: 100,
          revenueAtRisk: 5000
        }),
        makeRow({
          id: "high-risk",
          storeId: "STR002",
          dcFreeStock: 6,
          dcFreeStockOriginal: 6,
          stockOnHand: 0,
          forecastNext7: 14,
          forecastNext14: 28,
          marginAtRisk: 200,
          revenueAtRisk: 500
        })
      ],
      "optimal"
    );

    const highRisk = rows.find((row) => row.id === "high-risk");
    const mediumImpact = rows.find((row) => row.id === "medium-impact");

    expect(highRisk?.riskLevel).toBe("High");
    expect(highRisk?.finalQty).toBeGreaterThan(0);
    expect(mediumImpact?.finalQty).toBe(0);
    expect(mediumImpact?.reasonCode).toContain("Blocked: no DC free stock");
  });

  it("keeps lean replenishment conservative versus optimal and lost sales recovery", () => {
    const rows = [
      makeRow({ id: "a", storeId: "STR001", stockOnHand: 0, forecastNext7: 14, forecastNext14: 28 }),
      makeRow({ id: "b", storeId: "STR002", stockOnHand: 8, forecastNext7: 14, forecastNext14: 28 }),
      makeRow({ id: "c", storeId: "STR003", stockOnHand: 18, forecastNext7: 14, forecastNext14: 28 })
    ];

    const lean = recommendRows(rows, "inventory").reduce((sum, row) => sum + row.finalQty, 0);
    const optimal = recommendRows(rows, "optimal").reduce((sum, row) => sum + row.finalQty, 0);
    const lostSales = recommendRows(rows, "lostSales").reduce((sum, row) => sum + row.finalQty, 0);

    expect(lean).toBeLessThanOrEqual(optimal);
    expect(optimal).toBeLessThanOrEqual(lostSales);
  });

  it("does not lean-replenish exit lifecycle or low-confidence rows without urgent demand", () => {
    const rows = recommendRows(
      [
        makeRow({ id: "exit", lifecycleStatus: "Exit", stockOnHand: 0, forecastNext7: 20 }),
        makeRow({ id: "low-confidence", forecastConfidence: 0.5, stockOnHand: 10, forecastNext7: 5 })
      ],
      "inventory"
    );

    expect(rows.find((row) => row.id === "exit")?.finalQty).toBe(0);
    expect(rows.find((row) => row.id === "low-confidence")?.finalQty).toBe(0);
  });
});
