import path from "path";
import { writeCsv } from "@/lib/csv/writeCsv";
import type { CsvRecord, WorkingRow } from "@/lib/domain/types";
import { deliveryDate } from "@/lib/utils/dates";
import { round } from "@/lib/utils/numbers";

export async function createShippingDocuments(outputDir: string, approvalId: string, runDate: string, rows: WorkingRow[], planId = ""): Promise<number> {
  const docs = new Map<string, CsvRecord[]>();

  for (const row of rows) {
    const date = deliveryDate(runDate, row.deliveryDay);
    const docId = `${approvalId}_${row.routeId}_${date}_${row.storeId}`;
    const list = docs.get(docId) ?? [];
    list.push({
      shipping_doc_id: docId,
      approval_id: approvalId,
      plan_id: planId,
      currency: "EUR",
      display_metadata_origin: row.displayMetadataOrigin ?? "synthetic_grocery_overlay",
      quantity_origin: row.quantityOrigin ?? "synthetic_operational_conversion",
      commercial_origin: "synthetic",
      route_id: row.routeId,
      delivery_date: date,
      store_id: row.storeId,
      store_name: row.storeName,
      sku_id: row.skuId,
      display_product_name: row.productName,
      category: row.category,
      approved_qty: String(row.finalQty),
      pack_multiple: String(row.packMultiple),
      unit_cost: String(row.unitCost),
      selling_price: String(row.sellingPrice),
      total_cost_value: String(round(row.finalQty * row.unitCost, 2)),
      total_retail_value: String(round(row.finalQty * row.sellingPrice, 2))
    });
    docs.set(docId, list);
  }

  for (const [docId, lines] of docs) {
    await writeCsv(path.join(outputDir, `${docId}.csv`), lines);
  }

  return docs.size;
}
