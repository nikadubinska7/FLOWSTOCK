import type { WorkingRow } from "@/lib/domain/types";
import { Badge } from "@/components/common/Badge";
import { ConstraintBadge, RiskBadge } from "@/components/replenishment/RowStatusBadge";
import { money, whole } from "@/lib/utils/formatters";
import { zeroRecommendationReasons } from "@/lib/domain/recommendationReview";

export function RowExplanationDrawer({ row, onClose, planGenerated }: { row: WorkingRow | null; onClose: () => void; planGenerated: boolean }) {
  if (!row) return null;
  return (
    <aside className="glass-panel-strong fixed right-0 top-0 z-40 h-full overflow-y-auto w-full max-w-md rounded-l-3xl p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{row.storeName}</h2>
          <p className="text-sm text-cockpit-muted">{row.skuId} · {row.productName}</p>
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
        {planGenerated && row.systemRecommendedQty === 0 ? <section className="rounded-xl border border-amber-300/20 p-3 space-y-2">
          <h3 className="font-semibold">Why the system recommends 0</h3>
          {zeroRecommendationReasons(row).map(reason => <p key={reason.label}><span className="font-semibold">{reason.label}:</span> {reason.detail}</p>)}
          <p className="text-cockpit-muted">Risk is measured before the plan. High risk does not remove stock, case-pack or capacity limits. A zero final quantity recovers no sales.</p>
        </section> : null}
        <section className="rounded-xl border border-white/10 p-3 space-y-2">
          <h3 className="font-semibold">Forecast evidence · 14 days</h3>
          <p>Applied: {whole(row.forecastNext14)} · baseline: {whole(row.baselineForecast ?? row.forecastNext14)} · ML: {row.modelForecast === undefined ? "unavailable" : whole(row.modelForecast)}</p>
          <p>{row.modelForecast === undefined ? "Uncalibrated fallback range" : "ML prediction range"}: {whole(row.forecastLower ?? 0)}–{whole(row.forecastUpper ?? row.forecastNext14 * 2)}</p>
          <p>Model: {row.modelVersion ?? "deterministic-v1"} · {row.forecastFallback ? "Baseline fallback active" : "Approved ML active"}</p>
          <p>{row.forecastSignals}</p>
          <p>Proxy ranking challenger: {row.rankingScore === undefined ? "unavailable" : row.rankingScore.toFixed(3)}. Active priority uses deterministic margin/service contributions.</p>
          <p className="text-cockpit-muted">Demand origin: {row.dataOrigin}. Display names and operational units are synthetic. Currency and margins are simulated. No real allocation outcomes are available.</p>
          <p>Normalized objective contributions: margin {(row.normalizedMarginContribution ?? 0).toFixed(4)}, service {(row.normalizedServiceContribution ?? 0).toFixed(4)}.</p>
          <p>Margin contribution: {money(row.expectedRecoveredMargin)}. Shortage reduced: {whole(row.sellingPrice ? row.expectedRecoveredRevenue / row.sellingPrice : 0)} operational units. DC residual: {whole(row.dcFreeStock)}.</p>
        </section>
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
          {row.constraintWarnings?.map(w=><p key={w} className="text-amber-200">Warning: {w}</p>)}
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
