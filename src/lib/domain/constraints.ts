import type { ConstraintStatus, WorkingRow } from "@/lib/domain/types";

export function validateRow(row: WorkingRow, skuDcBlocked = false): WorkingRow {
  const messages: string[] = [];
  let status: ConstraintStatus = row.dataIssueSeverity.toLowerCase() === "blocker" ? "Blocked" : "Valid";
  const hasApprovalQty = row.finalQty > 0;

  const add = (message: string) => {
    messages.push(message);
  };

  if (hasApprovalQty && skuDcBlocked) add("Final quantity exceeds DC free stock after all edits");
  if (hasApprovalQty && row.finalQty % row.packMultiple !== 0) add("Final quantity is not a pack multiple");
  if (row.manualOverride && !row.comment.trim()) add("Manual override needs a comment");
  if (row.dataIssueSeverity.toLowerCase() === "blocker") add("Blocker data quality issue");

  return {
    ...row,
    constraintStatus: status,
    constraintMessages: messages
  };
}

export function isApprovalBlocked(row: WorkingRow): boolean {
  return row.finalQty > 0 && row.constraintMessages.some((message) => [
    "Final quantity exceeds DC free stock after all edits",
    "Final quantity is not a pack multiple",
    "Manual override needs a comment",
    "Blocker data quality issue"
  ].includes(message));
}

export function validateRows(rows: WorkingRow[]): WorkingRow[] {
  const skuRows = new Map<string, WorkingRow[]>();
  for (const row of rows) {
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

  return rows.map((row) => validateRow(row, dcBlockedRowIds.has(row.id)));
}
