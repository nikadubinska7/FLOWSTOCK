import type { WorkingRow } from "@/lib/domain/types";

export function validateRow(row: WorkingRow, skuDcBlocked = false): WorkingRow {
  const messages: string[] = [];
  const qty = row.finalQty;
  if (!Number.isSafeInteger(qty) || qty < 0)
    messages.push("Quantity must be a non-negative integer");
  if (row.manualOverride && !row.comment.trim())
    messages.push("Manual override needs a comment");
  if (qty > 0) {
    if (skuDcBlocked)
      messages.push("Final quantity exceeds DC free stock after all edits");
    if (
      !Number.isSafeInteger(row.packMultiple) ||
      row.packMultiple < 1 ||
      qty % row.packMultiple !== 0
    )
      messages.push("Final quantity is not a pack multiple");
    if (!row.ranged) messages.push("Not ranged");
    if (
      !row.replenishable ||
      ["discontinued", "inactive", "blocked"].includes(
        row.lifecycleStatus.toLowerCase(),
      )
    )
      messages.push("SKU not replenishable");
    if (row.dataIssueSeverity.toLowerCase() === "blocker")
      messages.push("Blocker data quality issue");
    if (row.stockOnHand + row.inTransitQty + qty > row.storeSkuCapacityUnits)
      messages.push("Hard SKU capacity exceeded");
    if (
      qty < (row.minShipment ?? row.packMultiple) ||
      qty > (row.maxShipment ?? Number.MAX_SAFE_INTEGER)
    )
      messages.push("Shipment quantity outside limits");
    if (
      !Number.isFinite(row.daysToDelivery) ||
      row.daysToDelivery < 0 ||
      row.daysToDelivery >= 14
    )
      messages.push("Delivery outside planning horizon");
  }
  return {
    ...row,
    constraintStatus: messages.length ? "Blocked" : "Valid",
    constraintMessages: messages,
  };
}
export function isApprovalBlocked(row: WorkingRow): boolean {
  return (
    row.constraintStatus === "Blocked" || row.constraintMessages.length > 0
  );
}
export function validateRows(rows: WorkingRow[]): WorkingRow[] {
  const sku = new Map<string, number>(),
    category = new Map<string, number>(),
    receiving = new Map<string, number>();
  for (const r of rows) {
    sku.set(r.skuId, (sku.get(r.skuId) ?? 0) + r.finalQty);
    const key = `${r.storeId}|${r.category}`;
    category.set(
      key,
      (category.get(key) ?? 0) + r.stockOnHand + r.inTransitQty + r.finalQty,
    );
    receiving.set(r.storeId, (receiving.get(r.storeId) ?? 0) + r.finalQty);
  }
  return rows.map((r) => {
    const v = validateRow(
      r,
      (sku.get(r.skuId) ?? 0) > (r.dcFreeStockOriginal ?? r.dcFreeStock),
    );
    if (
      r.finalQty > 0 &&
      (category.get(`${r.storeId}|${r.category}`) ?? 0) >
        r.hardCategoryCapacityUnits
    )
      v.constraintMessages.push("Hard category capacity exceeded");
    if (
      r.finalQty > 0 &&
      (receiving.get(r.storeId) ?? 0) > r.receivingCapacityUnits
    )
      v.constraintMessages.push("Store receiving capacity exceeded");
    v.constraintWarnings = [];
    if (r.forecastConfidence < 0.6)
      v.constraintWarnings.push("Low forecast confidence");
    if (
      (category.get(`${r.storeId}|${r.category}`) ?? 0) >
      r.softCategoryCapacityUnits
    )
      v.constraintWarnings.push("Soft category capacity exceeded");
    v.constraintStatus = v.constraintMessages.length ? "Blocked" : "Valid";
    return v;
  });
}
