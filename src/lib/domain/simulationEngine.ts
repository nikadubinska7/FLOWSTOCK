import { promises as fs } from "fs";
import path from "path";
import { readCsv } from "@/lib/csv/readCsv";
import { writeCsv } from "@/lib/csv/writeCsv";
import type { ApprovalResponse, CsvRecord, WorkingRow } from "@/lib/domain/types";
import { addDays, deliveryDate } from "@/lib/utils/dates";
import { latestPackagePath, nextInputPath, outputRootForRun, runsRoot } from "@/lib/utils/filePaths";
import { n, round } from "@/lib/utils/numbers";
import { createShippingDocuments } from "@/lib/domain/shippingDocuments";
import { isApprovalBlocked } from "@/lib/domain/constraints";

function key(storeId: string, skuId: string): string {
  return `${storeId}|${skuId}`;
}

function nextOrderId(index: number): string {
  return `APPROVED${String(index + 1).padStart(6, "0")}`;
}

async function copyPackage(source: string, destination: string): Promise<void> {
  await fs.mkdir(destination, { recursive: true });
  const files = await fs.readdir(source);
  await Promise.all(
    files
      .filter((file) => file.endsWith(".csv") || file.endsWith(".txt") || file.endsWith(".json"))
      .map((file) => fs.copyFile(path.join(source, file), path.join(destination, file)))
  );
}

export async function approveRows(runDate: string, scenario: string, rows: WorkingRow[], createDocs: boolean, sourceOverride?: string): Promise<ApprovalResponse> {
  const validRows = rows.filter((row) => row.finalQty > 0 && !isApprovalBlocked(row));
  const blockedRowsExcluded = rows.filter((row) => row.finalQty > 0 && isApprovalBlocked(row)).length;
  const approvalId = `APR-${runDate}-${Date.now()}`;
  const outputRoot = outputRootForRun(runDate);
  const approvedDir = path.join(outputRoot, "approved_replenishment");
  const shippingDir = path.join(outputRoot, "shipping_docs");
  const sourcePackage = sourceOverride ?? await latestPackagePath();
  const nextRunDate = addDays(runDate, 1);
  const nextPackage = nextInputPath(nextRunDate, approvalId);

  const approvedRows: CsvRecord[] = validRows.map((row) => ({
    approval_id: approvalId,
    plan_id: scenario,
    store_id: row.storeId,
    store_name: row.storeName,
    sku_id: row.skuId,
    display_product_name: row.productName,
    category: row.category,
    approved_qty: String(row.finalQty),
    unit_cost: String(row.unitCost),
    selling_price: String(row.sellingPrice),
    total_cost_value: String(round(row.finalQty * row.unitCost, 2)),
    total_retail_value: String(round(row.finalQty * row.sellingPrice, 2)),
    currency: "EUR",
    commercial_origin: "simulated",
    expected_recovered_revenue: String(row.expectedRecoveredRevenue),
    expected_recovered_margin: String(row.expectedRecoveredMargin),
    manual_override: row.manualOverride ? "1" : "0",
    comment: row.comment,
    reason_code: row.reasonCode
  }));

  await writeCsv(path.join(approvedDir, `${approvalId}.csv`), approvedRows);
  const shippingDocsCreated = createDocs ? await createShippingDocuments(shippingDir, approvalId, runDate, validRows, scenario) : 0;
  await copyPackage(sourcePackage, nextPackage);
  await createNextPackageFiles(sourcePackage, nextPackage, runDate, nextRunDate, approvalId, scenario, validRows);

  await fs.writeFile(path.join(runsRoot,"active.json"), JSON.stringify({date: nextRunDate, approval_id: approvalId}));
  return {
    approvalId,
    approvedRows: validRows.length,
    approvedUnits: validRows.reduce((sum, row) => sum + row.finalQty, 0),
    totalRetailValue: validRows.reduce((sum,r)=>sum+r.finalQty*r.sellingPrice,0),
    totalCostValue: validRows.reduce((sum,r)=>sum+r.finalQty*r.unitCost,0),
    blockedRowsExcluded,
    outputPath: outputRoot,
    nextPackagePath: nextPackage,
    shippingDocsCreated
  };
}

async function createNextPackageFiles(sourcePackage: string, destination: string, runDate: string, nextRunDate: string, approvalId: string, scenario: string, approvedRows: WorkingRow[]): Promise<void> {
  const approvedBySku = new Map<string, number>();
  const approvedByStoreSku = new Map<string, WorkingRow>();
  for (const row of approvedRows) {
    approvedBySku.set(row.skuId, (approvedBySku.get(row.skuId) ?? 0) + row.finalQty);
    approvedByStoreSku.set(key(row.storeId, row.skuId), row);
  }

  const dc = await readCsv(path.join(sourcePackage, "dc_inventory.csv"));
  await writeCsv(
    path.join(destination, "dc_inventory.csv"),
    dc.map((row) => {
      const qty = approvedBySku.get(row.sku_id) ?? 0;
      return {
        ...row,
        dc_free_stock: String(Math.max(0, n(row.dc_free_stock) - qty)),
        dc_reserved_stock: String(n(row.dc_reserved_stock) + qty)
      };
    })
  );

  const openOrders = await readCsv(path.join(sourcePackage, "open_orders.csv"));
  const products = await readCsv(path.join(sourcePackage, "sku_master.csv"));
  const legacySportswear = products.some(row => Boolean(row.style_color_size));
  // Original sportswear orders are already dispatched: their quantities match
  // store in-transit stock, not the independent DC reservation balances.
  for (const order of openOrders) {
    if (!order.dc_accounting) order.dc_accounting = legacySportswear ? "dispatched" : "reserved_until_delivery";
  }
  const newOrders = approvedRows.map((row, index) => ({
    order_id: nextOrderId(openOrders.length + index),
    store_id: row.storeId,
    sku_id: row.skuId,
    order_qty: String(row.finalQty),
    ship_date: runDate,
    expected_arrival_date: deliveryDate(runDate, row.deliveryDay),
    status: "In transit",
    dc_accounting: "reserved_until_delivery"
  }));
  await writeCsv(path.join(destination, "open_orders.csv"), [...openOrders, ...newOrders]);

  const sourceForecast = await readCsv(path.join(sourcePackage, "forecast_next_28d.csv"));
  const forecastByKey = new Map(sourceForecast.map(r => [key(r.store_id, r.sku_id), n(r.forecast_daily_sales_base)]));
  const allOrders = [...openOrders, ...newOrders];
  const arrivals = new Map<string, number>();
  const deliveredBySku = new Map<string, number>();
  for (const order of allOrders) {
    if (order.status !== "Delivered" && order.expected_arrival_date <= nextRunDate) {
      if (order.dc_accounting === "reserved_until_delivery")
        deliveredBySku.set(order.sku_id, (deliveredBySku.get(order.sku_id) ?? 0) + n(order.order_qty));
      const k = key(order.store_id, order.sku_id); arrivals.set(k, (arrivals.get(k) ?? 0) + n(order.order_qty)); order.status = "Delivered";
    }
  }
  await writeCsv(path.join(destination, "open_orders.csv"), allOrders);
  // Reserved DC stock remains in the books until arrival; then remove it exactly once.
  const reservedDc = await readCsv(path.join(destination,"dc_inventory.csv"));
  await writeCsv(path.join(destination,"dc_inventory.csv"), reservedDc.map(r=>{
    const delivered = deliveredBySku.get(r.sku_id) ?? 0;
    if(delivered > n(r.dc_reserved_stock)) throw new Error("DELIVERY_EXCEEDS_RESERVED_STOCK");
    return {...r,dc_reserved_stock:String(n(r.dc_reserved_stock)-delivered),dc_total_stock:String(n(r.dc_total_stock)-delivered)};
  }));
  const storeInventory = await readCsv(path.join(sourcePackage, "store_inventory.csv"));
  const salesRows: CsvRecord[] = [];
  await writeCsv(
    path.join(destination, "store_inventory.csv"),
    storeInventory.map((row) => {
      const approved = approvedByStoreSku.get(key(row.store_id, row.sku_id));
      const forecast = forecastByKey.get(key(row.store_id, row.sku_id)) ?? 0;
      const simulatedDemand = Math.max(0, Math.round(forecast * 1.03));
      const actualSales = Math.min(Math.round(n(row.stock_on_hand)), simulatedDemand);
      salesRows.push({
        date: runDate,
        data_origin: "simulated_next_day",
        store_id: row.store_id,
        sku_id: row.sku_id,
        demand_units: String(simulatedDemand),
        actual_sales_units: String(actualSales),
        lost_sales_units: String(Math.max(0, simulatedDemand - actualSales))
      });
      return {
        ...row,
        run_date: nextRunDate,
        stock_on_hand: String(Math.max(0, Math.round(n(row.stock_on_hand) - actualSales + (arrivals.get(key(row.store_id, row.sku_id)) ?? 0)))),
        in_transit_qty: String(Math.max(0, Math.round(n(row.in_transit_qty) + (approved?.finalQty ?? 0) - (arrivals.get(key(row.store_id, row.sku_id)) ?? 0))))
      };
    })
  );

  const salesHistory = await readCsv(path.join(sourcePackage, "sales_history_28d.csv"));
  await writeCsv(path.join(destination, "sales_history_28d.csv"), [...salesHistory.filter(r => r.date >= addDays(nextRunDate, -28)), ...salesRows]);

  const forecast = await readCsv(path.join(sourcePackage, "forecast_next_28d.csv"));
  const salesByKey = new Map(salesRows.map(row => [key(row.store_id, row.sku_id), row]));
  await writeCsv(
    path.join(destination, "forecast_next_28d.csv"),
    forecast.map((row) => {
      const approved = approvedByStoreSku.get(key(row.store_id, row.sku_id));
      const observed = salesByKey.get(key(row.store_id, row.sku_id));
      const error = observed ? n(observed.demand_units) - n(row.forecast_daily_sales_base) : 0;
      const factor = n(row.forecast_daily_sales_base)>0 ? Math.max(0.98,Math.min(1.02,1+0.1*error/n(row.forecast_daily_sales_base))) : 1;
      const daily = Math.max(0.01, n(row.forecast_daily_sales_base) * factor);
      const confidence = Math.max(0.45, Math.min(0.95, n(row.forecast_confidence, 0.75) + (approved ? 0.005 : -0.002)));
      return {
        ...row,
        model_version: "deterministic-v1",
        model_forecast: "",
        model_normalized: "", ranking_score: "", quality: "",
        source_origin: "simulated_next_day",
        normalized_forecast_14: "",
        baseline: String(round(daily * 14, 4)),
        lower: "0", upper: String(round(daily * 28, 4)),
        signals: "Simulated next-day moving-average fallback; range is uncalibrated",
        forecast_daily_sales_base: String(round(daily, 4)),
        forecast_next_7_units: String(Math.round(daily * 7 * (1 + n(row.promo_uplift_pct)))),
        forecast_next_14_units: String(Math.round(daily * 14 * (1 + n(row.promo_uplift_pct)))),
        forecast_next_28_units: String(Math.round(daily * 28 * (1 + n(row.promo_uplift_pct)))),
        forecast_confidence: String(round(confidence, 3))
      };
    })
  );

  const previousApprovals = await readCsv(path.join(sourcePackage, "approval_history.csv"));
  await writeCsv(path.join(destination,"approval_history.csv"), [...previousApprovals, ...approvedRows.map(r=>({approval_id:approvalId,plan_id:scenario,store_id:r.storeId,sku_id:r.skuId,approved_qty:String(r.finalQty),system_recommended_qty:String(r.systemRecommendedQty),comment:r.comment,timestamp:new Date().toISOString(),data_origin:"planner_decision"}))]);
  const overrides = await readCsv(path.join(sourcePackage, "manual_overrides.csv"));
  await writeCsv(path.join(destination,"manual_overrides.csv"), [...overrides, ...approvedRows.filter(r=>r.manualOverride).map(r=>({plan_id:scenario,store_id:r.storeId,sku_id:r.skuId,system_recommended_qty:String(r.systemRecommendedQty),final_qty:String(r.finalQty),comment:r.comment,timestamp:new Date().toISOString()}))]);
  const totalApprovedUnits = approvedRows.reduce((sum, row) => sum + row.finalQty, 0);
  const totalRetailValue = approvedRows.reduce((sum, row) => sum + row.finalQty * row.sellingPrice, 0);
  const totalCostValue = approvedRows.reduce((sum, row) => sum + row.finalQty * row.unitCost, 0);
  await writeCsv(path.join(destination, "simulation_state.csv"), [
    {
      run_date: nextRunDate,
      business_day_number: String(n((await readCsv(path.join(sourcePackage, "simulation_state.csv")))[0]?.business_day_number, 1) + 1),
      plan_id: scenario,
      source_package: sourcePackage,
      previous_package: sourcePackage,
      new_package: destination,
      approval_id: approvalId,
      approved_rows: String(approvedRows.length),
      total_approved_units: String(totalApprovedUnits),
      total_retail_value: String(round(totalRetailValue, 2)),
      total_cost_value: String(round(totalCostValue, 2)),
      notes: "Generated by Flowstock approval simulation loop."
    }
  ]);
}
