import type { ConstraintStatus, WorkingRow } from "@/lib/domain/types";

export function validateRow(row: WorkingRow, projectedCategoryStock?: number, currentCategoryStock?: number, skuDcBlocked = false): WorkingRow {
  const messages: string[] = [];
  let status: ConstraintStatus = "Valid";
  const hasApprovalQty = row.finalQty > 0;

  const block = (message: string) => {
    messages.push(message);
    status = "Blocked";
  };
  const warn = (message: string) => {
    messages.push(message);
    if (status !== "Blocked") status = "Warning";
  };

  if (hasApprovalQty && skuDcBlocked) block("Final quantity exceeds DC free stock after all edits");
  if (hasApprovalQty && row.finalQty % row.packMultiple !== 0) block("Final quantity is not a pack multiple");
  if (row.manualOverride && !row.comment.trim()) block("Manual override needs a comment");
  if (hasApprovalQty && !row.ranged) block("Store-SKU is not ranged");
  if (hasApprovalQty && !row.replenishable) block("SKU is not replenishable");
  if (hasApprovalQty && row.stockOnHand + row.inTransitQty + row.finalQty > row.storeSkuCapacityUnits) block("Projected SKU stock exceeds hard capacity");
  if (
    hasApprovalQty &&
    projectedCategoryStock !== undefined &&
    currentCategoryStock !== undefined &&
    projectedCategoryStock > row.hardCategoryCapacityUnits &&
    currentCategoryStock <= row.hardCategoryCapacityUnits
  ) {
    block("Projected category stock exceeds hard capacity");
  }
  if (row.dataIssueSeverity.toLowerCase() === "blocker") block("Blocker data quality issue");

  if (row.forecastConfidence < 0.65) warn("Low forecast confidence");
  if (projectedCategoryStock !== undefined && projectedCategoryStock > row.softCategoryCapacityUnits) warn("Soft category capacity exceeded");
  if (
    hasApprovalQty &&
    projectedCategoryStock !== undefined &&
    currentCategoryStock !== undefined &&
    projectedCategoryStock > row.hardCategoryCapacityUnits &&
    currentCategoryStock > row.hardCategoryCapacityUnits
  ) {
    warn("Category hard capacity already exceeded before this plan");
  }
  if (row.promoUpliftPct > 0.7) warn("Promo uplift unusually high");
  if (row.dcFreeStock < row.packMultiple * 2) warn("DC free stock low after approval");

  return {
    ...row,
    constraintStatus: status,
    constraintMessages: messages
  };
}

export function validateRows(rows: WorkingRow[]): WorkingRow[] {
  const categoryTotals = new Map<string, number>();
  const currentCategoryTotals = new Map<string, number>();
  const skuRows = new Map<string, WorkingRow[]>();
  for (const row of rows) {
    const key = `${row.storeId}|${row.category}`;
    categoryTotals.set(key, (categoryTotals.get(key) ?? 0) + row.stockOnHand + row.inTransitQty + row.finalQty);
    currentCategoryTotals.set(key, (currentCategoryTotals.get(key) ?? 0) + row.stockOnHand + row.inTransitQty);
    const list = skuRows.get(row.skuId) ?? [];
    list.push(row);
    skuRows.set(row.skuId, list);
  }

  const dcBlockedRowIds = new Set<string>();
  for (const rowsForSku of skuRows.values()) {
    let remaining = rowsForSku[0]?.dcFreeStockOriginal ?? rowsForSku[0]?.dcFreeStock ?? 0;
    const approvalRows = rowsForSku
      .filter((row) => row.finalQty > 0)
      .sort((a, b) => {
        if (b.expectedRecoveredRevenue !== a.expectedRecoveredRevenue) return b.expectedRecoveredRevenue - a.expectedRecoveredRevenue;
        return b.finalQty - a.finalQty;
      });
    for (const row of approvalRows) {
      if (row.finalQty <= remaining) {
        remaining -= row.finalQty;
      } else {
        dcBlockedRowIds.add(row.id);
      }
    }
  }

  return rows.map((row) => {
    const key = `${row.storeId}|${row.category}`;
    return validateRow(row, categoryTotals.get(key), currentCategoryTotals.get(key), dcBlockedRowIds.has(row.id));
  });
}
