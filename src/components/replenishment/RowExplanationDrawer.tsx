import type { WorkingRow } from "@/lib/domain/types";
import { Badge } from "@/components/common/Badge";
import { ConstraintBadge, RiskBadge } from "@/components/replenishment/RowStatusBadge";
import { money, whole } from "@/lib/utils/formatters";

export function RowExplanationDrawer({ row, onClose }: { row: WorkingRow | null; onClose: () => void }) {
  if (!row) return null;
  return (
    <aside className="glass-panel-strong fixed right-0 top-0 z-40 h-full w-full max-w-md rounded-l-3xl p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{row.storeName}</h2>
          <p className="text-sm text-cockpit-muted">{row.skuId} · {row.styleColorSize}</p>
        </div>
        <button className="rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 text-sm text-cockpit-muted hover:text-cockpit-text" onClick={onClose}>Close</button>
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        <RiskBadge risk={row.riskLevel} />
        <ConstraintBadge status={row.constraintStatus} />
        {row.promoFlag ? <Badge tone="amber">Promo</Badge> : null}
        {row.manualOverride ? <Badge tone="blue">Manual override</Badge> : null}
      </div>
      <div className="space-y-4 text-sm">
        <section>
          <h3 className="mb-2 font-semibold">Recommendation logic</h3>
          <p className="text-cockpit-muted">{row.reasonCode}</p>
        </section>
        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-cockpit-muted">System qty</p><p className="text-2xl font-semibold">{whole(row.systemRecommendedQty)}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-cockpit-muted">Final qty</p><p className="text-2xl font-semibold">{whole(row.finalQty)}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-cockpit-muted">Recovered revenue</p><p className="text-2xl font-semibold">{money(row.expectedRecoveredRevenue)}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-cockpit-muted">Recovered margin</p><p className="text-2xl font-semibold">{money(row.expectedRecoveredMargin)}</p></div>
        </section>
        <section>
          <h3 className="mb-2 font-semibold">Constraints</h3>
          {row.constraintMessages.length ? (
            <ul className="space-y-2 text-cockpit-muted">
              {row.constraintMessages.map((message) => <li key={message}>• {message}</li>)}
            </ul>
          ) : (
            <p className="text-cockpit-muted">No blocking constraint for this row.</p>
          )}
        </section>
        {row.dataIssue ? <section><h3 className="mb-2 font-semibold">Data issue</h3><p className="text-cockpit-muted">{row.dataIssueSeverity}: {row.dataIssueDescription}</p></section> : null}
      </div>
    </aside>
  );
}
