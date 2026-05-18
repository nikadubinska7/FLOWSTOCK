import { promises as fs } from "fs";
import path from "path";
import { readCsv } from "@/lib/csv/readCsv";
import { writeCsv } from "@/lib/csv/writeCsv";
import type { ApprovalResponse, CsvRecord, WorkingRow } from "@/lib/domain/types";
import { addDays, deliveryDate } from "@/lib/utils/dates";
import { latestPackagePath, nextInputPath, outputRootForRun } from "@/lib/utils/filePaths";
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
      .filter((file) => file.endsWith(".csv") || file.endsWith(".txt"))
      .map((file) => fs.copyFile(path.join(source, file), path.join(destination, file)))
  );
}

export async function approveRows(runDate: string, scenario: string, rows: WorkingRow[], createDocs: boolean): Promise<ApprovalResponse> {
  const validRows = rows.filter((row) => row.finalQty > 0 && !isApprovalBlocked(row));
  const blockedRowsExcluded = rows.filter((row) => row.finalQty > 0 && isApprovalBlocked(row)).length;
  const approvalId = `APR-${runDate}-${Date.now()}`;
  const outputRoot = outputRootForRun(runDate);
  const approvedDir = path.join(outputRoot, "approved_replenishment");
  const shippingDir = path.join(outputRoot, "shipping_docs");
  const sourcePackage = await latestPackagePath();
  const nextRunDate = addDays(runDate, 1);
  const nextPackage = nextInputPath(nextRunDate);

  const approvedRows: CsvRecord[] = validRows.map((row) => ({
    approval_id: approvalId,
    scenario,
    store_id: row.storeId,
    store_name: row.storeName,
    sku_id: row.skuId,
    style_color_size: row.styleColorSize,
    category: row.category,
    approved_qty: String(row.finalQty),
    unit_cost: String(row.unitCost),
    selling_price: String(row.sellingPrice),
    total_cost_value: String(round(row.finalQty * row.unitCost, 2)),
    total_retail_value: String(round(row.finalQty * row.sellingPrice, 2)),
    expected_recovered_revenue: String(row.expectedRecoveredRevenue),
    expected_recovered_margin: String(row.expectedRecoveredMargin),
    manual_override: row.manualOverride ? "1" : "0",
    comment: row.comment,
    reason_code: row.reasonCode
  }));

  await writeCsv(path.join(approvedDir, `${approvalId}.csv`), approvedRows);
  const shippingDocsCreated = createDocs ? await createShippingDocuments(shippingDir, approvalId, runDate, validRows) : 0;
  await copyPackage(sourcePackage, nextPackage);
  await createNextPackageFiles(sourcePackage, nextPackage, runDate, nextRunDate, approvalId, scenario, validRows);

  return {
    approvalId,
    approvedRows: validRows.length,
    approvedUnits: validRows.reduce((sum, row) => sum + row.finalQty, 0),
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
  const newOrders = approvedRows.map((row, index) => ({
    order_id: nextOrderId(openOrders.length + index),
    store_id: row.storeId,
    sku_id: row.skuId,
    order_qty: String(row.finalQty),
    ship_date: runDate,
    expected_arrival_date: deliveryDate(runDate, row.deliveryDay),
    status: "In transit"
  }));
  await writeCsv(path.join(destination, "open_orders.csv"), [...openOrders, ...newOrders]);

  const storeInventory = await readCsv(path.join(sourcePackage, "store_inventory.csv"));
  const salesRows: CsvRecord[] = [];
  await writeCsv(
    path.join(destination, "store_inventory.csv"),
    storeInventory.map((row) => {
      const approved = approvedByStoreSku.get(key(row.store_id, row.sku_id));
      const forecast = approved?.averageDailySales ?? 0;
      const simulatedDemand = Math.max(0, Math.round(forecast * 1.03));
      const actualSales = Math.min(Math.round(n(row.stock_on_hand)), simulatedDemand);
      salesRows.push({
        date: runDate,
        store_id: row.store_id,
        sku_id: row.sku_id,
        demand_units: String(simulatedDemand),
        actual_sales_units: String(actualSales),
        lost_sales_units: String(Math.max(0, simulatedDemand - actualSales))
      });
      return {
        ...row,
        run_date: nextRunDate,
        stock_on_hand: String(Math.max(0, Math.round(n(row.stock_on_hand) - actualSales))),
        in_transit_qty: String(Math.round(n(row.in_transit_qty) + (approved?.finalQty ?? 0)))
      };
    })
  );

  const salesHistory = await readCsv(path.join(sourcePackage, "sales_history_28d.csv"));
  await writeCsv(path.join(destination, "sales_history_28d.csv"), [...salesHistory.slice(-240000), ...salesRows]);

  const forecast = await readCsv(path.join(sourcePackage, "forecast_next_28d.csv"));
  await writeCsv(
    path.join(destination, "forecast_next_28d.csv"),
    forecast.map((row) => {
      const approved = approvedByStoreSku.get(key(row.store_id, row.sku_id));
      const factor = approved && approved.expectedRecoveredRevenue > 0 ? 1.02 : 0.995;
      const daily = Math.max(0.01, n(row.forecast_daily_sales_base) * factor);
      const confidence = Math.max(0.45, Math.min(0.95, n(row.forecast_confidence, 0.75) + (approved ? 0.005 : -0.002)));
      return {
        ...row,
        forecast_daily_sales_base: String(round(daily, 4)),
        forecast_next_7_units: String(Math.round(daily * 7 * (1 + n(row.promo_uplift_pct)))),
        forecast_next_14_units: String(Math.round(daily * 14 * (1 + n(row.promo_uplift_pct)))),
        forecast_next_28_units: String(Math.round(daily * 28 * (1 + n(row.promo_uplift_pct)))),
        forecast_confidence: String(round(confidence, 3))
      };
    })
  );

  const totalApprovedUnits = approvedRows.reduce((sum, row) => sum + row.finalQty, 0);
  const totalRetailValue = approvedRows.reduce((sum, row) => sum + row.finalQty * row.sellingPrice, 0);
  const totalCostValue = approvedRows.reduce((sum, row) => sum + row.finalQty * row.unitCost, 0);
  await writeCsv(path.join(destination, "simulation_state.csv"), [
    {
      run_date: nextRunDate,
      business_day_number: "2",
      last_approved_scenario: scenario,
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
