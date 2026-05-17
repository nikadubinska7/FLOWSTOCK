import type { ScenarioComparisonRow, ScenarioKey, WorkingRow } from "@/lib/domain/types";
import { addReason, reasonText } from "@/lib/domain/reasonCodes";
import { scenarioForKey, scenarios } from "@/lib/domain/scenarioWeights";
import { recalculateRows, calculateKpis } from "@/lib/domain/kpiCalculations";
import { riskForRow } from "@/lib/domain/riskScoring";
import { round } from "@/lib/utils/numbers";

function roundedNeed(rawNeed: number, packMultiple: number, capacityRoom: number, scenario: ScenarioKey): number {
  if (rawNeed <= 0) return 0;
  const rounded = Math.ceil(rawNeed / packMultiple) * packMultiple;
  if (scenario === "inventory" && rawNeed < packMultiple * 0.45) return 0;
  return Math.max(0, Math.min(rounded, Math.floor(capacityRoom / packMultiple) * packMultiple));
}

function targetCoverDaysForScenario(row: WorkingRow, scenario: ScenarioKey): number {
  if (scenario === "lostSales") return Math.max(row.targetCoverDays, 14) * 1.08;
  if (scenario === "optimal") return row.targetCoverDays;
  return row.minCoverDays;
}

function priorityScore(row: WorkingRow, scenario: ScenarioKey): number {
  const config = scenarioForKey(scenario);
  const promoFactor = 1 + row.promoUpliftPct;
  const riskBoost = row.daysOfCover <= row.daysToDelivery ? 1.35 : 1;
  const inventoryPenalty = Math.max(0, row.daysOfCover - 14) * config.inventoryPenaltyWeight;
  return (
    row.marginAtRisk * config.grossMarginWeight * row.forecastConfidence * row.storeSkuPriority * promoFactor +
    row.revenueAtRisk * config.revenueWeight * riskBoost +
    row.serviceLevelTarget * 100 * config.serviceLevelWeight -
    inventoryPenalty -
    row.packMultiple * config.logisticsPenaltyWeight
  );
}

const riskRank: Record<WorkingRow["riskLevel"], number> = { Blocked: 3, High: 2, Medium: 1, Low: 0 };

function currentRisk(row: WorkingRow): WorkingRow["riskLevel"] {
  return riskForRow(row);
}

function impactScore(row: WorkingRow): number {
  return Math.max(row.expectedRecoveredRevenue, row.revenueAtRisk, row.marginAtRisk);
}

function allocationPriority(a: WorkingRow, b: WorkingRow, scenario: ScenarioKey): number {
  const riskDelta = riskRank[currentRisk(b)] - riskRank[currentRisk(a)];
  if (riskDelta !== 0) return riskDelta;

  const impactDelta = impactScore(b) - impactScore(a);
  if (impactDelta !== 0) return impactDelta;

  return priorityScore(b, scenario) - priorityScore(a, scenario);
}

function hasClearZeroReason(row: WorkingRow): boolean {
  const reason = row.reasonCode.toLowerCase();
  return [
    "blocked:",
    "no replenishment:",
    "no replenishment needed",
    "dc shortage allocation",
    "sku not replenishable",
    "not ranged",
    "data issue",
    "capacity capped"
  ].some((text) => reason.includes(text));
}

function adjustedDailyForecast(row: WorkingRow): number {
  return Math.max(0, row.averageDailySales * row.seasonalIndex * (1 + row.promoUpliftPct));
}

function leanDemandUntilNextDelivery(row: WorkingRow): number {
  const daily = adjustedDailyForecast(row);
  if (row.forecastNext7 > 0) return row.forecastNext7;
  return daily * Math.max(row.daysToDelivery, row.minCoverDays);
}

function applyLeanOverstockGuard(row: WorkingRow, recommended: number, demandUntilNextDelivery: number): number {
  if (recommended <= 0) return 0;
  const daily = adjustedDailyForecast(row);
  if (daily <= 0) return recommended;

  const availableStoreStock = row.stockOnHand + row.inTransitQty;
  let validQty = recommended;
  while (validQty > 0) {
    const projectedStockAfterDemand = Math.max(0, availableStoreStock + validQty - demandUntilNextDelivery);
    const projectedCover = projectedStockAfterDemand / daily;
    if (projectedCover <= row.maxCoverDays) return validQty;
    validQty -= row.packMultiple;
  }

  return 0;
}

function leanRecommendedQty(row: WorkingRow, reasons: Set<string>): number {
  const availableStoreStock = row.stockOnHand + row.inTransitQty;
  const daily = adjustedDailyForecast(row);
  const lifecycle = row.lifecycleStatus.toLowerCase();
  const rowRisk = currentRisk(row);

  if (!row.ranged) {
    addReason(reasons, "Blocked: not ranged");
    return 0;
  }
  if (!row.replenishable) {
    addReason(reasons, "Blocked: not replenishable");
    return 0;
  }
  if (row.dataIssueSeverity.toLowerCase() === "blocker") {
    addReason(reasons, "Blocked: blocker data issue");
    return 0;
  }
  if (lifecycle === "exit") {
    addReason(reasons, "Blocked: lifecycle exit");
    return 0;
  }
  if (lifecycle === "markdown" && !(row.replenishable && (rowRisk === "High" || row.stockOnHand === 0) && row.forecastNext7 > 0)) {
    addReason(reasons, "No replenishment: markdown lifecycle");
    return 0;
  }

  const meaningfulDemand = row.forecastNext14 >= Math.max(1, row.packMultiple * 0.5);
  if (daily < 0.15 && rowRisk !== "High" && !(row.stockOnHand === 0 && meaningfulDemand)) {
    addReason(reasons, "No replenishment: no forecast demand");
    return 0;
  }

  if (row.forecastConfidence < 0.65 && rowRisk !== "High" && !(row.stockOnHand === 0 && row.forecastNext7 >= row.packMultiple)) {
    addReason(reasons, "No replenishment: low forecast confidence");
    return 0;
  }

  const demandUntilNextDelivery = leanDemandUntilNextDelivery(row);
  const minimumRequiredStock = demandUntilNextDelivery + row.minPresentationQty;
  const rawNeed = minimumRequiredStock - availableStoreStock;
  const projectedStockout = availableStoreStock < demandUntilNextDelivery;
  if (!projectedStockout && row.daysOfCover >= row.minCoverDays) {
    addReason(reasons, "No replenishment needed");
    return 0;
  }
  if (rawNeed <= 0) {
    addReason(reasons, "No replenishment needed");
    return 0;
  }

  const capacityRoom = Math.max(0, Math.min(row.storeSkuCapacityUnits - availableStoreStock, row.receivingCapacityUnits));
  if (capacityRoom < row.packMultiple) {
    addReason(reasons, "Blocked: hard capacity");
    return 0;
  }
  let recommended = Math.ceil(rawNeed / row.packMultiple) * row.packMultiple;
  recommended = Math.min(recommended, Math.floor(capacityRoom / row.packMultiple) * row.packMultiple);
  recommended = applyLeanOverstockGuard(row, recommended, demandUntilNextDelivery);
  if (recommended === 0) addReason(reasons, "No replenishment: pack multiple would create excess");

  if (recommended > 0 && recommended !== Math.ceil(rawNeed / row.packMultiple) * row.packMultiple) {
    addReason(reasons, "Capacity capped");
  }
  if (recommended > 0 && row.promoFlag) addReason(reasons, "Promo uplift");
  if (recommended > 0 && row.stockOnHand === 0) addReason(reasons, "Projected stockout");
  return recommended;
}

function sortRecommendedRows(rows: WorkingRow[]): WorkingRow[] {
  return [...rows].sort((a, b) => {
    if (riskRank[b.riskLevel] !== riskRank[a.riskLevel]) return riskRank[b.riskLevel] - riskRank[a.riskLevel];
    if (b.expectedRecoveredRevenue !== a.expectedRecoveredRevenue) return b.expectedRecoveredRevenue - a.expectedRecoveredRevenue;
    if ((b.finalQty > 0 ? 1 : 0) !== (a.finalQty > 0 ? 1 : 0)) return (b.finalQty > 0 ? 1 : 0) - (a.finalQty > 0 ? 1 : 0);
    if (a.storeName !== b.storeName) return a.storeName.localeCompare(b.storeName);
    return a.skuId.localeCompare(b.skuId);
  });
}

export function recommendRows(baseRows: WorkingRow[], scenario: ScenarioKey): WorkingRow[] {
  const config = scenarioForKey(scenario);
  const bySku = new Map<string, WorkingRow[]>();

  const prepared = baseRows.map((row) => {
    const reasons = new Set<string>();
    const rowRisk = currentRisk(row);
    addReason(reasons, "Low days cover", row.daysOfCover <= row.daysToDelivery + 2);
    addReason(reasons, "Projected stockout", row.stockOnHand + row.inTransitQty < row.forecastNext7);
    addReason(reasons, "Promo uplift", row.promoFlag);
    addReason(reasons, "Demand spike", row.forecastNext14 > row.forecastNext7 * 2.2);
    addReason(reasons, "Forecast under-call correction", row.forecastConfidence < 0.65);
    addReason(reasons, "Store priority", row.storeSkuPriority >= 0.9);
    addReason(reasons, "Blocked: not replenishable", !row.replenishable);
    addReason(reasons, "Blocked: not ranged", !row.ranged);
    addReason(reasons, row.dataIssueSeverity.toLowerCase() === "blocker" ? "Blocked: blocker data issue" : "Data issue", row.dataIssue);

    const currentStock = row.stockOnHand + row.inTransitQty;
    const daily = adjustedDailyForecast(row);
    const projectedStockout = currentStock < Math.max(row.forecastNext7, daily * Math.max(1, row.daysToDelivery));
    const shouldCalculateNeed = projectedStockout || row.daysOfCover < row.minCoverDays;
    const targetCoverDays = targetCoverDaysForScenario(row, scenario);
    const minimumRequiredStock = row.forecastNext7 + row.minPresentationQty;
    const adjustedDemand = scenario === "lostSales"
      ? Math.max(row.forecastNext14, daily * targetCoverDays, minimumRequiredStock)
      : Math.max(daily * targetCoverDays, minimumRequiredStock);
    const targetStock = Math.min(
      row.storeSkuCapacityUnits,
      adjustedDemand * config.targetCoverMultiplier + row.minPresentationQty
    );
    const capacityRoom = Math.max(0, row.storeSkuCapacityUnits - currentStock);
    const rawNeed = shouldCalculateNeed ? Math.max(0, targetStock - currentStock) : 0;
    let recommended = scenario === "inventory"
      ? leanRecommendedQty(row, reasons)
      : row.ranged && row.replenishable && row.dataIssueSeverity.toLowerCase() !== "blocker" && row.lifecycleStatus.toLowerCase() !== "exit"
        ? roundedNeed(rawNeed, row.packMultiple, capacityRoom, scenario)
        : 0;

    if (recommended === 0 && scenario !== "inventory") {
      if (!row.ranged) addReason(reasons, "Blocked: not ranged");
      else if (!row.replenishable) addReason(reasons, "Blocked: not replenishable");
      else if (row.dataIssueSeverity.toLowerCase() === "blocker") addReason(reasons, "Blocked: blocker data issue");
      else if (row.lifecycleStatus.toLowerCase() === "exit") addReason(reasons, "Blocked: lifecycle exit");
      else if (row.forecastNext7 <= 0 && row.forecastNext14 <= 0 && daily <= 0) addReason(reasons, "No replenishment: no forecast demand");
      else if (!shouldCalculateNeed || rawNeed <= 0) addReason(reasons, "No replenishment needed");
      else if (capacityRoom < row.packMultiple) addReason(reasons, "Blocked: hard capacity");
      else addReason(reasons, rowRisk === "High" ? "Review: high risk with zero recommendation" : "No replenishment: pack multiple would create excess");
    }

    addReason(reasons, "Pack multiple rounding", recommended > 0 && recommended !== Math.ceil(rawNeed));
    addReason(reasons, "Capacity capped", recommended > 0 && recommended < Math.ceil(rawNeed / row.packMultiple) * row.packMultiple);

    return {
      ...row,
      systemRecommendedQty: recommended,
      finalQty: recommended,
      comment: "",
      manualOverride: false,
      reasonCode: reasonText(reasons)
    };
  });

  for (const row of prepared) {
    const list = bySku.get(row.skuId) ?? [];
    list.push(row);
    bySku.set(row.skuId, list);
  }

  const allocated: WorkingRow[] = [];
  for (const skuRows of bySku.values()) {
    const sorted = [...skuRows].sort((a, b) => allocationPriority(a, b, scenario));
    let remaining = sorted[0]?.dcFreeStockOriginal ?? sorted[0]?.dcFreeStock ?? 0;
    const allocatedById = new Map<string, WorkingRow>();

    for (const sortedRow of sorted) {
      let row = sortedRow;
      let qty = row.systemRecommendedQty;
      if (qty > 0 && remaining <= 0) {
        const reasons = new Set(row.reasonCode.split("; ").filter(Boolean));
        addReason(reasons, "Blocked: no DC free stock");
        row = { ...row, reasonCode: reasonText(reasons) };
        qty = 0;
      }
      if (qty > remaining) {
        const capped = Math.floor(remaining / row.packMultiple) * row.packMultiple;
        qty = Math.max(0, capped);
        const reasons = new Set(row.reasonCode.split("; ").filter(Boolean));
        addReason(reasons, qty > 0 ? "DC shortage allocation" : "Blocked: no DC free stock");
        row = { ...row, reasonCode: reasonText(reasons) };
      }
      remaining -= qty;
      allocatedById.set(row.id, { ...row, systemRecommendedQty: qty, finalQty: qty });
    }

    for (const row of skuRows) allocated.push(allocatedById.get(row.id) ?? row);
  }

  const recalculated = sortRecommendedRows(recalculateRows(allocated).map((row) => ({
    ...row,
    riskLevel: riskForRow(row),
    revenueAtRisk: round(row.revenueAtRisk, 2),
    marginAtRisk: round(row.marginAtRisk, 2)
  })));

  const highRiskZeroWithoutReason = recalculated.filter((row) => row.riskLevel === "High" && row.systemRecommendedQty === 0 && !hasClearZeroReason(row));
  if (highRiskZeroWithoutReason.length > 0) {
    console.warn(
      `[Flowstock] ${highRiskZeroWithoutReason.length} high-risk rows have zero recommendation without a blocking reason.`,
      highRiskZeroWithoutReason.slice(0, 20).map((row) => ({ id: row.id, reasonCode: row.reasonCode }))
    );
  }

  return recalculated.map((row) => {
    if (row.riskLevel !== "High" || row.systemRecommendedQty > 0 || hasClearZeroReason(row)) return row;
    const reasons = new Set(row.reasonCode.split("; ").filter(Boolean));
    addReason(reasons, "Review: high risk with zero recommendation");
    return { ...row, reasonCode: reasonText(reasons) };
  });
}

export function compareScenarios(rows: WorkingRow[]): ScenarioComparisonRow[] {
  const current = calculateKpis(rows, false);
  const currentRow: ScenarioComparisonRow = {
    name: "Current State",
    replenishmentUnits: 0,
    inventoryValue: current.inventoryValue,
    lostSalesValue: current.lostSalesValue,
    recoveredRevenue: 0,
    recoveredMargin: 0,
    oosPercent: current.oosPercent,
    constraintViolations: current.constraintViolations
  };
  const comparisonOrder: ScenarioKey[] = ["inventory", "optimal", "lostSales"];

  return [
    currentRow,
    ...comparisonOrder.map((key) => {
      const config = scenarios[key];
      const recommended = recommendRows(rows, key);
      const kpis = calculateKpis(recommended, true);
      return {
        name: config.name,
        replenishmentUnits: kpis.replenishmentUnits,
        inventoryValue: kpis.inventoryValue,
        lostSalesValue: kpis.lostSalesValue,
        recoveredRevenue: kpis.recoveredRevenue,
        recoveredMargin: kpis.recoveredMargin,
        oosPercent: kpis.oosPercent,
        constraintViolations: kpis.constraintViolations
      };
    })
  ];
}
