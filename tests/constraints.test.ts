import { describe, expect, it } from "vitest";
import { recalculateRows } from "../src/lib/domain/kpiCalculations";
import { makeRow } from "./testRows";

describe("approval constraints", () => {
  it("blocks manual overrides without a comment", () => {
    const [row] = recalculateRows([makeRow({ systemRecommendedQty: 6, finalQty: 12 })]);

    expect(row.manualOverride).toBe(true);
    expect(row.constraintStatus).toBe("Blocked");
    expect(row.constraintMessages).toContain("Manual override needs a comment");
  });

  it("allows manual overrides when a comment is present", () => {
    const [row] = recalculateRows([makeRow({ systemRecommendedQty: 6, finalQty: 12, comment: "Manager approved size curve change" })]);

    expect(row.manualOverride).toBe(true);
    expect(row.constraintStatus).not.toBe("Blocked");
  });

  it("recalculates remaining DC free stock from all final quantities", () => {
    const rows = recalculateRows([
      makeRow({ id: "a", storeId: "STR001", skuId: "SKU001", dcFreeStock: 120, dcFreeStockOriginal: 120, systemRecommendedQty: 60, finalQty: 48, comment: "Reduce shipment" }),
      makeRow({ id: "b", storeId: "STR002", skuId: "SKU001", dcFreeStock: 120, dcFreeStockOriginal: 120, systemRecommendedQty: 30, finalQty: 30 })
    ]);

    expect(rows[0].dcFreeStock).toBe(42);
    expect(rows[1].dcFreeStock).toBe(42);
  });

  it("blocks rows that exceed DC free stock after all final quantity edits", () => {
    const rows = recalculateRows([
      makeRow({ id: "a", storeId: "STR001", skuId: "SKU001", dcFreeStock: 12, dcFreeStockOriginal: 12, systemRecommendedQty: 6, finalQty: 12 }),
      makeRow({ id: "b", storeId: "STR002", skuId: "SKU001", dcFreeStock: 12, dcFreeStockOriginal: 12, systemRecommendedQty: 6, finalQty: 12 })
    ]);

    expect(rows.some((row) => row.constraintMessages.includes("Final quantity exceeds DC free stock after all edits"))).toBe(true);
  });
});
