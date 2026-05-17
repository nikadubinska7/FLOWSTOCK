import type { WorkingRow } from "@/lib/domain/types";
import { money, whole } from "@/lib/utils/formatters";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";

export function approvalSummary(rows: WorkingRow[], blockedRowsExcluded: number) {
  const stores = new Set(rows.map((row) => row.storeId)).size;
  const skus = new Set(rows.map((row) => row.skuId)).size;
  const units = rows.reduce((sum, row) => sum + row.finalQty, 0);
  const inventoryValue = rows.reduce((sum, row) => sum + row.finalQty * row.unitCost, 0);
  const revenue = rows.reduce((sum, row) => sum + row.expectedRecoveredRevenue, 0);
  const margin = rows.reduce((sum, row) => sum + row.expectedRecoveredMargin, 0);
  const manual = rows.filter((row) => row.manualOverride).length;
  return { stores, skus, units, inventoryValue, revenue, margin, manual, blockedRowsExcluded };
}

export function ApprovalModal({
  rows,
  blockedRowsExcluded,
  onCancel,
  onConfirm
}: {
  rows: WorkingRow[];
  blockedRowsExcluded: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const summary = approvalSummary(rows, blockedRowsExcluded);
  return (
    <Modal title="Confirm replenishment approval" onClose={onCancel}>
      <div className="space-y-4 text-sm text-cockpit-muted">
        <p className="text-cockpit-text">You are going to approve replenishment for:</p>
        <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <dt>Stores</dt><dd className="text-right text-lg font-semibold text-cockpit-text">{summary.stores}</dd>
          <dt>SKUs</dt><dd className="text-right text-lg font-semibold text-cockpit-text">{summary.skus}</dd>
          <dt>Total replenishment units</dt><dd className="text-right text-lg font-semibold text-cockpit-text">{whole(summary.units)}</dd>
          <dt>Inventory value</dt><dd className="text-right text-lg font-semibold text-cockpit-text">{money(summary.inventoryValue)}</dd>
          <dt>Expected recovered revenue</dt><dd className="text-right text-lg font-semibold text-emerald-200">{money(summary.revenue)}</dd>
          <dt>Expected recovered margin</dt><dd className="text-right text-lg font-semibold text-emerald-200">{money(summary.margin)}</dd>
          <dt>Rows with manual override</dt><dd className="text-right text-lg font-semibold text-cockpit-text">{summary.manual}</dd>
          <dt>Blocked rows excluded</dt><dd className="text-right text-lg font-semibold text-amber-200">{summary.blockedRowsExcluded}</dd>
        </dl>
        <div className="rounded-2xl border border-amber-300/18 bg-amber-400/8 p-4 text-amber-100">
          Blocked rows are excluded from this approval. Manual overrides still require comments.
        </div>
        <p className="text-cockpit-text">Confirm to proceed?</p>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={onConfirm}>Confirm</Button>
      </div>
    </Modal>
  );
}
