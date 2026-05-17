import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";

export function ShippingDocsModal({
  onNo,
  onYes
}: {
  onNo: () => void;
  onYes: () => void;
}) {
  return (
    <Modal title="Create shipping documents?" onClose={onNo}>
      <p className="text-sm leading-relaxed text-cockpit-muted">Create route, delivery date, and store-based shipping documents for approved rows?</p>
      <div className="mt-5 flex justify-end gap-3">
        <Button onClick={onNo}>No, approval only</Button>
        <Button variant="primary" onClick={onYes}>Yes, create by route and delivery date</Button>
      </div>
    </Modal>
  );
}
