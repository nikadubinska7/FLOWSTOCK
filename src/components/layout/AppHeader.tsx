import { ChevronDown, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/common/Button";

export function AppHeader({
  runDate,
  packagePath,
  loading,
  onRefresh
}: {
  runDate: string;
  packagePath: string;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#071122]/78 px-8 py-7 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1780px] flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-4xl font-semibold leading-tight text-cockpit-text">Flowstock</h1>
                <span className="rounded-full border border-blue-300/20 bg-blue-400/10 px-2.5 py-1 text-[10px] font-bold uppercase text-blue-100">Plan</span>
              </div>
              <p className="mt-2 text-base text-cockpit-muted">Make fast, high-impact replenishment decisions across stores, SKUs, and DC stock.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-400/8 px-4 py-2 text-sm text-cockpit-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <span className="h-2.5 w-2.5 rounded-full bg-cockpit-green shadow-[0_0_16px_rgba(52,211,153,0.7)]" />
            Data synced {runDate || "Loading"}
          </div>
          <div className="max-w-xl truncate rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-sm text-cockpit-muted">
            {packagePath || "No package loaded"}
          </div>
          <Button variant="primary" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-cockpit-line bg-cockpit-panel2 text-sm font-bold">
            <Sparkles size={17} className="text-cockpit-accent2" />
          </div>
          <ChevronDown size={17} className="hidden text-cockpit-muted sm:block" />
        </div>
      </div>
    </header>
  );
}
