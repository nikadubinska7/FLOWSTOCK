import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/common/Button";

export function Modal({
  title,
  children,
  onClose
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/78 p-4 backdrop-blur-md">
      <div role="dialog" aria-modal="true" aria-label={title} className="glass-panel-strong w-full max-w-xl rounded-3xl p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-cockpit-text">{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Close">
            <X size={18} />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
