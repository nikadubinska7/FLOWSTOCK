import type { ScenarioComparisonRow, ScenarioKey, WorkingRow } from "@/lib/domain/types";
import { addReason, reasonText } from "@/lib/domain/reasonCodes";
import { scenarioForKey, scenarios } from "@/lib/domain/scenarioWeights";
import { recalculateRows, calculateKpis } from "@/lib/domain/kpiCalculations";
import { riskForRow } from "@/lib/domain/riskScoring";
import { round } from "@/lib/utils/numbers";
import { baselineRequiredQty } from "@/lib/domain/baseline";

function roundedNeed(rawNeed: number, packMultiple: number): number {
  if (rawNeed <= 0) return 0;
  return Math.ceil(rawNeed / packMultiple) * packMultiple;
}

function targetCoverDaysForScenario(row: WorkingRow, scenario: ScenarioKey): number {
  if (scenario === "lostSales") return Math.max(row.targetCoverDays, 14) * 1.08;
  if (scenario === "optimal") return row.targetCoverDays;
  return row.minCoverDays;
}

const riskRank: Record<WorkingRow["riskLevel"], number> = { High: 3, Medium: 2, Low: 1 };

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

  if (b.revenueAtRisk !== a.revenueAtRisk) return b.revenueAtRisk - a.revenueAtRisk;
  return a.id.localeCompare(b.id);
}

function hasClearZeroReason(row: WorkingRow): boolean {
  const reason = row.reasonCode.toLowerCase();
  return [
    "blocked:",
    "no replenishment:",
    "no replenishment needed",
    "dc shortage allocation",
    "data issue"
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

function leanRecommendedQty(row: WorkingRow, reasons: Set<string>): number {
  const availableStoreStock = row.stockOnHand + row.inTransitQty;

  if (row.dataIssueSeverity.toLowerCase() === "blocker") {
    addReason(reasons, "Blocked: blocker data issue");
    return 0;
  }

  const demandUntilNextDelivery = leanDemandUntilNextDelivery(row);
  if (demandUntilNextDelivery <= 0) {
    addReason(reasons, "No replenishment: no forecast demand");
    return 0;
  }
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

  const recommended = Math.ceil(rawNeed / row.packMultiple) * row.packMultiple;

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
    const unconstrainedTargetStock = adjustedDemand * config.targetCoverMultiplier + row.minPresentationQty;
    const rawNeedBeforeConstraints = shouldCalculateNeed ? Math.max(0, unconstrainedTargetStock - currentStock) : 0;
    const requiredQty = row.baselineRequiredQty || row.requiredQty || baselineRequiredQty(row);
    let recommended = scenario === "inventory"
      ? leanRecommendedQty(row, reasons)
      : row.dataIssueSeverity.toLowerCase() !== "blocker"
        ? roundedNeed(rawNeedBeforeConstraints, row.packMultiple)
        : 0;

    if (recommended === 0 && scenario !== "inventory") {
      if (row.dataIssueSeverity.toLowerCase() === "blocker") addReason(reasons, "Blocked: blocker data issue");
      else if (row.forecastNext7 <= 0 && row.forecastNext14 <= 0 && daily <= 0) addReason(reasons, "No replenishment: no forecast demand");
      else if (!shouldCalculateNeed || rawNeedBeforeConstraints <= 0) addReason(reasons, "No replenishment needed");
      else addReason(reasons, rowRisk === "High" ? "Review: high risk with zero recommendation" : "No replenishment: no valid demand need");
    }

    addReason(reasons, "Pack multiple rounding", recommended > 0 && recommended !== Math.ceil(rawNeedBeforeConstraints));

    return {
      ...row,
      baselineRequiredQty: requiredQty,
      baselineRevenueAtRisk: row.baselineRevenueAtRisk || row.revenueAtRisk,
      requiredQty,
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
        addReason(reasons, "No replenishment: no DC free stock");
        row = { ...row, reasonCode: reasonText(reasons) };
        qty = 0;
      }
      if (qty > remaining) {
        const capped = Math.floor(remaining / row.packMultiple) * row.packMultiple;
        qty = Math.max(0, capped);
        const reasons = new Set(row.reasonCode.split("; ").filter(Boolean));
        addReason(reasons, qty > 0 ? "DC shortage allocation" : remaining > 0 ? "No replenishment: DC free stock below Pack / MOQ" : "No replenishment: no DC free stock");
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
