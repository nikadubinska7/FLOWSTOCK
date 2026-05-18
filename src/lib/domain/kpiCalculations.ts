import type { Kpis, WorkingRow } from "@/lib/domain/types";
import { round, safeDivide } from "@/lib/utils/numbers";
import { isApprovalBlocked, validateRows } from "@/lib/domain/constraints";

export function updateRowProjection(row: WorkingRow): WorkingRow {
  const projectedStock = row.stockOnHand + row.inTransitQty + row.finalQty;
  const projectedDays = row.averageDailySales > 0 ? projectedStock / row.averageDailySales : 999;
  const currentLostUnits = Math.max(0, row.forecastNext14 - row.stockOnHand - row.inTransitQty);
  const projectedLostUnits = Math.max(0, row.forecastNext14 - projectedStock);
  const recoveredUnits = Math.max(0, currentLostUnits - projectedLostUnits);

  return {
    ...row,
    projectedDaysOfCover: round(Math.min(projectedDays, 999), 1),
    revenueAtRisk: row.baselineRevenueAtRisk,
    marginAtRisk: round(currentLostUnits * row.sellingPrice * row.grossMarginPct, 2),
    expectedRecoveredRevenue: round(recoveredUnits * row.sellingPrice, 2),
    expectedRecoveredMargin: round(recoveredUnits * row.sellingPrice * row.grossMarginPct, 2),
    manualOverride: row.finalQty !== row.systemRecommendedQty
  };
}

export function recalculateRows(rows: WorkingRow[]): WorkingRow[] {
  const projectedRows = rows.map(updateRowProjection);
  const skuFinalQty = new Map<string, number>();
  for (const row of projectedRows) {
    skuFinalQty.set(row.skuId, (skuFinalQty.get(row.skuId) ?? 0) + row.finalQty);
  }
  return validateRows(projectedRows.map((row) => ({
    ...row,
    dcFreeStock: round((row.dcFreeStockOriginal ?? row.dcFreeStock) - (skuFinalQty.get(row.skuId) ?? 0), 0)
  })));
}

export function calculateKpis(rows: WorkingRow[], useFinalQty: boolean): Kpis {
  let inventoryValue = 0;
  let stockUnits = 0;
  let demandUnits = 0;
  let oosRows = 0;
  let lostSalesValue = 0;
  let marginAtRisk = 0;
  let recoveredRevenue = 0;
  let recoveredMargin = 0;
  let dcFreeStock = 0;
  let improvedRows = 0;
  let constraintViolations = 0;
  let replenishmentUnits = 0;
  const dcBySku = new Map<string, number>();

  for (const row of rows) {
    const finalQty = useFinalQty ? row.finalQty : 0;
    const stock = row.stockOnHand + row.inTransitQty + finalQty;
    const projectedLostUnits = Math.max(0, row.forecastNext14 - stock);
    const currentLostUnits = Math.max(0, row.forecastNext14 - row.stockOnHand - row.inTransitQty);

    inventoryValue += stock * row.unitCost;
    stockUnits += stock;
    demandUnits += row.averageDailySales;
    if (stock <= 0 || (row.averageDailySales > 0 && stock / row.averageDailySales <= row.daysToDelivery)) oosRows += 1;
    lostSalesValue += projectedLostUnits * row.sellingPrice;
    marginAtRisk += projectedLostUnits * row.sellingPrice * row.grossMarginPct;
    recoveredRevenue += Math.max(0, currentLostUnits - projectedLostUnits) * row.sellingPrice;
    recoveredMargin += Math.max(0, currentLostUnits - projectedLostUnits) * row.sellingPrice * row.grossMarginPct;
    if (finalQty > 0 && projectedLostUnits < currentLostUnits) improvedRows += 1;
    if (isApprovalBlocked(row)) constraintViolations += 1;
    replenishmentUnits += finalQty;
    dcBySku.set(row.skuId, useFinalQty ? row.dcFreeStock : (row.dcFreeStockOriginal ?? row.dcFreeStock));
  }

  for (const freeStock of dcBySku.values()) dcFreeStock += freeStock;

  return {
    inventoryValue: round(inventoryValue, 0),
    daysOfCover: round(safeDivide(stockUnits, demandUnits), 1),
    oosPercent: round(safeDivide(oosRows, rows.length) * 100, 1),
    lostSalesValue: round(lostSalesValue, 0),
    marginAtRisk: round(marginAtRisk, 0),
    recoveredRevenue: round(recoveredRevenue, 0),
    recoveredMargin: round(recoveredMargin, 0),
    dcFreeStock: round(dcFreeStock, 0),
    improvedRows,
    constraintViolations,
    replenishmentUnits
  };
}
