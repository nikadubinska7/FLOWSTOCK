import path from "path";
import {validatePackage} from "./dataValidation";
import { readCsv } from "@/lib/csv/readCsv";
import type { CsvRecord, DataIssueSummary, RunHistoryRow, WorkingRow } from "@/lib/domain/types";
import { n, round } from "@/lib/utils/numbers";
import { daysUntilDelivery } from "@/lib/utils/dates";
import { riskForRow } from "@/lib/domain/riskScoring";
import { recalculateRows } from "@/lib/domain/kpiCalculations";
import { baselineRequiredQty } from "@/lib/domain/baseline";

export type LoadedPackage = {
  runDate: string;
  rows: WorkingRow[];
  dataIssues: DataIssueSummary[];
  runHistory: RunHistoryRow[];
  raw: Record<string, CsvRecord[]>;
};

function key(storeId: string, skuId: string): string {
  return `${storeId}|${skuId}`;
}

function mapBy(rows: CsvRecord[], fields: string[]): Map<string, CsvRecord> {
  const map = new Map<string, CsvRecord>();
  for (const row of rows) map.set(fields.map((field) => row[field]).join("|"), row);
  return map;
}

function issueMap(rows: CsvRecord[]): Map<string, CsvRecord> {
  const map = new Map<string, CsvRecord>();
  for (const row of rows) {
    if (row.resolved_flag === "1") continue;
    const issueKey = key(row.store_id, row.sku_id);
    const current = map.get(issueKey);
    if (!current || row.severity.toLowerCase() === "blocker") map.set(issueKey, row);
  }
  return map;
}

export async function loadCsvPackage(packagePath: string): Promise<LoadedPackage> {
  const fileNames = [
    "stores",
    "sku_master",
    "dc_inventory",
    "assortment",
    "store_inventory",
    "forecast_next_28d",
    "promo_calendar",
    "open_orders",
    "capacity_rules",
    "data_quality_issues",
    "approval_history",
    "simulation_state"
  ];

  const entries = await Promise.all(fileNames.map(async (name) => [name, await readCsv(path.join(packagePath, `${name}.csv`))] as const));
  const raw = Object.fromEntries(entries);
  validatePackage(raw);
  const runDate = raw.simulation_state[0]?.run_date ?? raw.store_inventory[0]?.run_date ?? "2026-05-15";

  const stores = mapBy(raw.stores, ["store_id"]);
  const skus = mapBy(raw.sku_master, ["sku_id"]);
  const dc = mapBy(raw.dc_inventory, ["sku_id"]);
  const assortment = mapBy(raw.assortment, ["store_id", "sku_id"]);
  const forecasts = mapBy(raw.forecast_next_28d, ["store_id", "sku_id"]);
  const capacity = mapBy(raw.capacity_rules, ["store_id", "category"]);
  const issues = issueMap(raw.data_quality_issues);

  const rows = raw.store_inventory.map((inventory): WorkingRow => {
    const store = stores.get(inventory.store_id) ?? {};
    const sku = skus.get(inventory.sku_id) ?? {};
    const dcRow = dc.get(inventory.sku_id) ?? {};
    const assortmentRow = assortment.get(key(inventory.store_id, inventory.sku_id)) ?? {};
    const forecast = forecasts.get(key(inventory.store_id, inventory.sku_id)) ?? {};
    const capacityRow = capacity.get(`${inventory.store_id}|${sku.category}`) ?? {};
    const issue = issues.get(key(inventory.store_id, inventory.sku_id));

    const stockOnHand = n(inventory.stock_on_hand);
    const inTransitQty = n(inventory.in_transit_qty);
    const averageDailySales = n(forecast.forecast_daily_sales_base);
    const daysOfCover = averageDailySales > 0 ? (stockOnHand + inTransitQty) / averageDailySales : 999;
    const forecastNext14 = n(forecast.forecast_next_14_units);
    const sellingPrice = n(sku.selling_price);
    const grossMarginPct = n(sku.gross_margin_pct);
    const currentLostUnits = Math.max(0, forecastNext14 - stockOnHand - inTransitQty);
    const dcFreeStock = n(dcRow.dc_free_stock);
    const baselineRevenueAtRisk = round(currentLostUnits * sellingPrice, 2);
    const baselineInput = {
      stockOnHand,
      inTransitQty,
      averageDailySales,
      forecastNext7: n(forecast.forecast_next_7_units),
      daysOfCover: round(Math.min(daysOfCover, 999), 1),
      packMultiple: Math.max(1, n(sku.pack_multiple, 1)),
      promoUpliftPct: n(forecast.promo_uplift_pct),
      seasonalIndex: n(forecast.seasonal_index, 1),
      minPresentationQty: n(sku.min_presentation_qty),
      minCoverDays: n(assortmentRow.min_cover_days, 7),
      targetCoverDays: n(assortmentRow.target_cover_days, 14)
    };

    return {
      id: key(inventory.store_id, inventory.sku_id),
      selected: false,
      rankingScore: forecast.ranking_score ? n(forecast.ranking_score) : undefined,
      forecastLower: n(forecast.lower, 0),
      forecastUpper: n(forecast.upper, forecastNext14 * 2),
      baselineForecast: n(forecast.baseline, forecastNext14),
      modelForecast: forecast.model_forecast ? n(forecast.model_forecast) : undefined,
      modelVersion: forecast.model_version || "deterministic-v1",
      forecastFallback: true,
      forecastEligible: Boolean(forecast.model_forecast) && forecast.fallback?.toLowerCase() !== "true",
      forecastSignals: forecast.signals || "Moving-average forecast; uncalibrated fallback range",
      dataOrigin: forecast.source_origin || (sku.style_color_size ? "synthetic_sportswear_fixture" : "synthetic_fixture"),
      displayMetadataOrigin: sku.display_metadata_origin || (sku.style_color_size ? "synthetic_sportswear_fixture" : "synthetic_grocery_overlay"),
      quantityOrigin: forecast.quantity_origin || (sku.style_color_size ? "synthetic_unit_counts" : "synthetic_operational_conversion"),

      storeId: inventory.store_id,
      storeName: store.store_name ?? inventory.store_id,
      routeId: store.route_id ?? "R01",
      deliveryDay: store.delivery_day ?? "Monday",
      category: sku.category ?? "Unknown",
      skuId: inventory.sku_id,
      productName: sku.display_product_name || sku.style_color_size || inventory.sku_id,
      productDescription: sku.display_product_name || [sku.subcategory, sku.style_color_size].filter(Boolean).join(" · ") || inventory.sku_id,
      baselineRequiredQty: baselineRequiredQty(baselineInput),
      baselineRevenueAtRisk,
      requiredQty: baselineRequiredQty(baselineInput),
      systemRecommendedQty: 0,
      finalQty: 0,
      stockOnHand,
      inTransitQty,
      averageDailySales,
      forecastNext7: baselineInput.forecastNext7,
      forecastNext14,
      daysOfCover: round(Math.min(daysOfCover, 999), 1),
      projectedDaysOfCover: round(Math.min(daysOfCover, 999), 1),
      daysToDelivery: daysUntilDelivery(runDate, store.delivery_day ?? "Monday"),
      packMultiple: baselineInput.packMultiple,
      dcTotalStock: n(dcRow.dc_total_stock),
      dcFreeStock,
      dcFreeStockOriginal: dcFreeStock,
      revenueAtRisk: baselineRevenueAtRisk,
      marginAtRisk: round(currentLostUnits * sellingPrice * grossMarginPct, 2),
      expectedRecoveredRevenue: 0,
      expectedRecoveredMargin: 0,
      forecastConfidence: n(forecast.quality, n(forecast.forecast_confidence, 0.5)),
      promoFlag: forecast.promo_flag_next_28d === "1" || n(forecast.promo_uplift_pct) > 0,
      promoUpliftPct: baselineInput.promoUpliftPct,
      seasonalIndex: baselineInput.seasonalIndex,
      riskLevel: "Low",
      reasonCode: "No replenishment needed",
      constraintStatus: "Valid",
      constraintMessages: [],
      comment: "",
      manualOverride: false,
      dataIssue: Boolean(issue),
      dataIssueSeverity: issue?.severity ?? "",
      dataIssueDescription: issue?.issue_description ?? "",
      ranged: assortmentRow.ranged_flag === "1",
      replenishable: sku.replenishable_flag === "1",
      storeSkuCapacityUnits: n(assortmentRow.store_sku_capacity_units, 999),
      softCategoryCapacityUnits: n(capacityRow.soft_capacity_units, 999999),
      hardCategoryCapacityUnits: n(capacityRow.hard_capacity_units, 999999),
      receivingCapacityUnits: n(store.receiving_capacity_units_per_delivery, 999999),
      unitCost: n(sku.unit_cost),
      sellingPrice,
      grossMarginPct,
      minPresentationQty: baselineInput.minPresentationQty,
      targetCoverDays: baselineInput.targetCoverDays,
      minCoverDays: baselineInput.minCoverDays,
      maxCoverDays: n(assortmentRow.max_cover_days, 21),
      serviceLevelTarget: n(assortmentRow.service_level_target, 0.9),
      storeSkuPriority: n(assortmentRow.store_sku_priority, n(store.store_priority, 0.75)),
      lifecycleStatus: sku.lifecycle_status ?? "Active"
    };
  });

  const validatedRows = recalculateRows(rows).map((row) => ({ ...row, riskLevel: riskForRow(row) }));

  return {
    runDate,
    rows: validatedRows,
    dataIssues: raw.data_quality_issues
      .filter((row) => row.resolved_flag !== "1")
      .map((row) => ({
        issueId: row.issue_id,
        storeId: row.store_id,
        skuId: row.sku_id,
        issueType: row.issue_type,
        description: row.issue_description,
        severity: row.severity,
        blocksApproval: row.severity.toLowerCase() === "blocker"
      })),
    runHistory: raw.simulation_state.map((row) => ({
      runDate: row.run_date,
      scenario: row.plan_id || row.last_approved_scenario || "Initial package",
      approvedRows: n(row.approved_rows),
      approvedUnits: n(row.total_approved_units),
      retailValue: n(row.total_retail_value),
      costValue: n(row.total_cost_value),
      packagePath
    })),
    raw
  };
}
