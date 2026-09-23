import { shortage } from "./availability";
import type { WorkingRow } from "./types";
import { recalculateRows } from "./kpiCalculations";
import { isApprovalBlocked } from "./constraints";
import defaults from "../../../config/objective.json";
export type ObjectiveConfig = Omit<typeof defaults, "budget"> & {
  budget: number | null;
};
export type PlanSummary = ReturnType<typeof summarizePlan>;
export const objectiveConfig = defaults;

export function summarizePlan(
  rows: WorkingRow[],
  config: ObjectiveConfig = defaults,
) {
  const stock = new Map<
    string,
    { sku_id: string; available: number; allocated: number; residual: number }
  >();
  let demand = 0,
    before = 0,
    gain = 0,
    margin = 0,
    potentialMargin = 0,
    potentialService = 0;
  for (const r of rows) {
    const currentShortage = Math.max(
      0,
      r.forecastNext14 - r.stockOnHand - r.inTransitQty,
    );
    const recoverable = shortage(r);
    const recovered = Math.min(recoverable, r.finalQty);
    const unitMargin = Math.max(0, r.sellingPrice - r.unitCost);
    demand += r.forecastNext14;
    before += Math.min(r.forecastNext14, r.stockOnHand + r.inTransitQty);
    gain += recovered;
    margin += recovered * unitMargin;
    potentialMargin += recoverable * unitMargin;
    potentialService += recoverable;
    const s = stock.get(r.skuId) ?? {
      sku_id: r.skuId,
      available: r.dcFreeStockOriginal,
      allocated: 0,
      residual: 0,
    };
    s.allocated += r.finalQty;
    s.residual = s.available - s.allocated;
    stock.set(r.skuId, s);
  }
  const marginContribution = potentialMargin ? margin / potentialMargin : 0;
  const serviceContribution = potentialService ? gain / potentialService : 0;
  const serviceAfter = demand ? (before + gain) / demand : 1;
  return {
    config,
    expected_margin: margin,
    projected_service_before: demand ? before / demand : 1,
    projected_service_after: serviceAfter,
    margin_contribution: marginContribution,
    service_contribution: serviceContribution,
    objective_value:
      config.margin_weight * marginContribution +
      config.service_weight * serviceContribution,
    service_floor_shortfall: Math.max(0, config.service_floor - serviceAfter),
    underserved: rows
      .filter(
        (r) =>
          Math.max(0, r.forecastNext14 - r.stockOnHand - r.inTransitQty) >
          r.finalQty,
      )
      .map((r) => r.id),
    stock: [...stock.values()].sort((a, b) => a.sku_id.localeCompare(b.sku_id)),
    constraint_violations: rows.filter(isApprovalBlocked).length,
    method:
      "deterministic marginal-pack heuristic; no global optimality guarantee",
    allocation_coverage: rows.length
      ? rows.filter((r) => r.finalQty > 0).length / rows.length
      : 0,
    stockout_units_avoided: gain,
    impact_origin: "simulated",
    ranking_label: "proxy_semi_synthetic",
  };
}

export function recommendPlan(
  base: WorkingRow[],
  config: ObjectiveConfig = defaults,
): WorkingRow[] {
  if (
    ![config.margin_weight, config.service_weight].every(
      (v) => Number.isFinite(v) && v >= 0,
    ) ||
    Math.abs(config.margin_weight + config.service_weight - 1) > 1e-8
  )
    throw new Error("Invalid objective weights");
  const rows = base.map((r) => ({
    ...r,
    finalQty: 0,
    systemRecommendedQty: 0,
    priorityScore: 0,
    constraintAdjustments: [] as string[],
    comment: "",
    manualOverride: false,
    reasonCode: "No eligible demand",
    constraintMessages: [] as string[],
  }));
  const marginTotal = rows.reduce(
    (s, r) => s + shortage(r) * Math.max(0, r.sellingPrice - r.unitCost),
    0,
  );
  const serviceTotal = rows.reduce((s, r) => s + shortage(r), 0);
  const dc = new Map<string, number>(),
    cats = new Map<string, number>(),
    receiving = new Map<string, number>();
  for (const r of rows) {
    dc.set(r.skuId, r.dcFreeStockOriginal);
    const key = `${r.storeId}|${r.category}`;
    cats.set(key, (cats.get(key) ?? 0) + r.stockOnHand + r.inTransitQty);
  }
  // Candidate marginal packs are sorted once. Returns diminish only on the last pack.
  const packs: {
    row: WorkingRow;
    qty: number;
    score: number;
    ordinal: number;
    floor: boolean;
  }[] = [];
  for (const r of rows) {
    const pack = r.packMultiple,
      need = shortage(r);
    if (
      !r.ranged ||
      !r.replenishable ||
      ["discontinued", "inactive", "blocked"].includes(
        r.lifecycleStatus.toLowerCase(),
      ) ||
      r.dataIssueSeverity.toLowerCase() === "blocker" ||
      !Number.isSafeInteger(pack) ||
      pack < 1 ||
      r.daysToDelivery >= 14
    ) {
      r.reasonCode = !r.ranged
        ? "Not ranged"
        : !r.replenishable
          ? "SKU not replenishable"
          : "Data issue or delivery constraint";
      continue;
    }
    if (need <= 0) {
      r.reasonCode = "No replenishment needed";
      continue;
    }
    const room = Math.max(
      0,
      r.storeSkuCapacityUnits - r.stockOnHand - r.inTransitQty,
    );
    const max = Math.min(
      Math.ceil(need / pack) * pack,
      Math.floor(room / pack) * pack,
      r.maxShipment ?? Infinity,
      Math.floor(r.dcFreeStockOriginal / pack) * pack,
    );
    if (Math.ceil(need / pack) * pack > need)
      r.constraintAdjustments.push("Rounded to complete cases");
    if (room < need)
      r.constraintAdjustments.push("Store-product capacity capped");
    if ((r.maxShipment ?? Infinity) < need)
      r.constraintAdjustments.push("Maximum shipment capped");
    if (r.dcFreeStockOriginal < need)
      r.constraintAdjustments.push("DC stock limited");
    const initial = Math.ceil((r.minShipment ?? pack) / pack) * pack;
    for (let q = 0, ordinal = 0; q < max; ordinal++) {
      const qty = q === 0 ? initial : pack;
      if (q + qty > max) break;
      const units = Math.min(qty, Math.max(0, need - q));
      if (units <= 0) break;
      const score =
        config.margin_weight *
          (marginTotal
            ? (units * Math.max(0, r.sellingPrice - r.unitCost)) / marginTotal
            : 0) +
        config.service_weight * (serviceTotal ? units / serviceTotal : 0);
      packs.push({
        row: r,
        qty,
        score,
        ordinal,
        floor:
          r.stockOnHand + r.inTransitQty + q <
          r.forecastNext14 * config.service_floor,
      });
      q += qty;
    }
    if (max < initial) {
      const limits = [];
      if (r.dcFreeStockOriginal < initial)
        limits.push(
          r.dcFreeStockOriginal === 0
            ? "No DC free stock"
            : "DC stock below Pack / MOQ",
        );
      if (room < initial) limits.push("Capacity capped: store-SKU");
      if ((r.maxShipment ?? Infinity) < initial)
        limits.push("Maximum shipment capped");
      r.reasonCode = limits.length
        ? limits.join("; ")
        : "Demand below minimum shipment";
    }
  }
  packs.sort(
    (a, b) =>
      Number(b.floor) - Number(a.floor) ||
      b.score - a.score ||
      a.row.storeId.localeCompare(b.row.storeId) ||
      a.row.skuId.localeCompare(b.row.skuId) ||
      a.ordinal - b.ordinal,
  );
  let spent = 0;
  for (const p of packs) {
    const r = p.row,
      key = `${r.storeId}|${r.category}`,
      free = dc.get(r.skuId) ?? 0;
    const reasons = [];
    if (free < p.qty) reasons.push("DC shortage allocation");
    if ((cats.get(key) ?? 0) + p.qty > r.hardCategoryCapacityUnits)
      reasons.push("Capacity capped: category");
    if ((receiving.get(r.storeId) ?? 0) + p.qty > r.receivingCapacityUnits)
      reasons.push("Capacity capped: receiving");
    if (config.budget !== null && spent + p.qty * r.unitCost > config.budget)
      reasons.push("Budget capped");
    if (reasons.length) {
      r.constraintAdjustments = [
        ...new Set([...(r.constraintAdjustments ?? []), ...reasons]),
      ];
      r.reasonCode = r.constraintAdjustments.join("; ");
      continue;
    }
    r.finalQty += p.qty;
    r.systemRecommendedQty = r.finalQty;
    dc.set(r.skuId, free - p.qty);
    cats.set(key, (cats.get(key) ?? 0) + p.qty);
    receiving.set(r.storeId, (receiving.get(r.storeId) ?? 0) + p.qty);
    spent += p.qty * r.unitCost;
    r.reasonCode =
      "Forecast shortage; normalized margin/service marginal-pack priority; available DC stock and capacity respected";
    r.priorityScore = (r.priorityScore ?? 0) + p.score;
  }
  const result = recalculateRows(
    rows.map((r) => ({
      ...r,
      reasonCode: [...r.reasonCode.split("; "), ...r.constraintAdjustments]
        .filter((v, i, a) => a.indexOf(v) === i)
        .join("; "),
      normalizedMarginContribution: marginTotal
        ? (Math.min(shortage(r), r.finalQty) *
            Math.max(0, r.sellingPrice - r.unitCost)) /
          marginTotal
        : 0,
      normalizedServiceContribution: serviceTotal
        ? Math.min(shortage(r), r.finalQty) / serviceTotal
        : 0,
    })),
  );
  if (result.some((r) => r.finalQty > 0 && isApprovalBlocked(r)))
    throw new Error("INFEASIBLE_PLAN: allocation failed validation");
  return result.sort(
    (a, b) =>
      (b.priorityScore ?? 0) - (a.priorityScore ?? 0) ||
      a.id.localeCompare(b.id),
  );
}
