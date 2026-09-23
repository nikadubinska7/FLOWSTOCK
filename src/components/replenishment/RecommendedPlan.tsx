import type { PlanSummary } from "@/lib/domain/plan";
import { money, whole } from "@/lib/utils/formatters";
export function RecommendedPlan({
  loading,
  onRun,
  onReject,
  summary,
  active,
  snapshot,
  onSnapshot,
  models,
}: {
  loading: boolean;
  onRun: () => void;
  onReject: () => void;
  summary: PlanSummary | null;
  active: boolean;
  snapshot: string;
  onSnapshot: (s: string) => void;
  models: { id: string }[];
}) {
  return (
    <section className="glass-panel-strong rounded-3xl p-7" aria-busy={loading}>
      <h2 className="text-2xl font-semibold">Recommended plan</h2>
      <p className="my-3 text-sm text-cockpit-muted">
        Retail replenishment · original sportswear dataset: 70 stores and 1,200
        SKUs. Mock inventory and commercial data · simulated business impact.
      </p>
      <div className="flex flex-wrap gap-3 items-center">
        <label className="text-sm">
          Data snapshot{" "}
          <select
            aria-label="Data snapshot"
            className="ml-2 rounded bg-slate-800 p-2"
            value={snapshot}
            onChange={(e) => onSnapshot(e.target.value)}
            disabled={loading}
          >
            <option value="sportswear">
              Original sportswear · 70 stores · 1,200 SKUs
            </option>
            <option value="latest">Latest planning day</option>
            <option value="demo">Grocery demo · reference dataset</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                Grocery research data · {m.id}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={loading}
          onClick={onRun}
          className="rounded-xl bg-blue-600 px-5 py-3 font-semibold disabled:opacity-50"
        >
          {loading ? "Working…" : "Generate recommended plan"}
        </button>
        {active ? (
          <button
            disabled={loading}
            onClick={onReject}
            className="rounded-xl border border-rose-300/30 px-4 py-3"
          >
            Reject plan
          </button>
        ) : null}
      </div>
      {summary ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-4 text-sm">
          <div>
            Expected margin
            <p className="text-xl">{money(summary.expected_margin)}</p>
          </div>
          <div>
            Forecast fulfilment
            <p className="text-xl">
              {(summary.projected_service_before * 100).toFixed(1)}% →{" "}
              {(summary.projected_service_after * 100).toFixed(1)}%
            </p>
          </div>
          <div>
            DC available / allocated / residual
            <p>
              {whole(summary.stock.reduce((s, r) => s + r.available, 0))} /{" "}
              {whole(summary.stock.reduce((s, r) => s + r.allocated, 0))} /{" "}
              {whole(summary.stock.reduce((s, r) => s + r.residual, 0))}
            </p>
          </div>
          <div>
            Objective weights
            <p>
              Margin {summary.config.margin_weight * 100}% · service{" "}
              {summary.config.service_weight * 100}%
            </p>
            <p>{summary.config.version}</p>
          </div>
          <p className="sm:col-span-4 text-cockpit-muted">
            Service target: {summary.config.service_floor * 100}%.{" "}
            {summary.service_floor_shortfall > 0
              ? `Shortfall ${(summary.service_floor_shortfall * 100).toFixed(1)} percentage points; ${summary.underserved.length} rows remain underserved.`
              : "Target reached."}{" "}
            Constraints take precedence. Marginal-pack heuristic; global
            optimality is not certified.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-cockpit-muted">
          Generate a plan to see recommendations. Missing or unapproved ML
          models use the deterministic baseline.
        </p>
      )}
    </section>
  );
}
