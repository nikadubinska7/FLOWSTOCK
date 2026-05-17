import { CheckCircle2, FileCheck2 } from "lucide-react";
import { Button } from "@/components/common/Button";

export function ApprovalBar({
  selectedCount,
  validVisibleCount,
  onApproveSelected,
  onApproveAll
}: {
  selectedCount: number;
  validVisibleCount: number;
  onApproveSelected: () => void;
  onApproveAll: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-30 mt-2 flex flex-col gap-4 rounded-3xl border border-white/10 bg-[#071122]/82 p-5 shadow-[0_-18px_70px_rgba(2,8,23,0.45)] backdrop-blur-xl md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-base font-semibold text-cockpit-text">Approval control</p>
        <p className="mt-1 text-sm text-cockpit-muted">{selectedCount} selected rows. {validVisibleCount} visible valid rows can be approved.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button onClick={onApproveSelected} disabled={selectedCount === 0}>
          <CheckCircle2 size={17} />
          Approve selected
        </Button>
        <Button variant="primary" onClick={onApproveAll} disabled={validVisibleCount === 0}>
          <FileCheck2 size={17} />
          Approve all valid rows
        </Button>
      </div>
    </div>
  );
}
