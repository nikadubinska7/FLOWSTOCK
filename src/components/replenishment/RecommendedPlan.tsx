import type { PlanSummary } from "@/lib/domain/plan";
import type { DataSourceId, DataSourceSummary } from "@/lib/dataSources/types";
import { money, whole } from "@/lib/utils/formatters";
export function RecommendedPlan({
  loading,
  onRun,
  onReject,
  summary,
  active,
  source,
  onSource,
  sources,
  snapshot,
  onSnapshot,
  onTestConnection,
  onSync,
  sourceActionLoading,
}: {
  loading: boolean;
  onRun: () => void;
  onReject: () => void;
  summary: PlanSummary | null;
  active: boolean;
  source: DataSourceId;
  onSource: (source: DataSourceId) => void;
  sources: DataSourceSummary[];
  snapshot: string;
  onSnapshot: (s: string) => void;
  onTestConnection: () => void;
  onSync: () => void;
  sourceActionLoading: boolean;
}) {
  const selectedSource = sources.find((item) => item.id === source);
  const canPlan = selectedSource?.capabilities.canPlan ?? false;
  return (
    <section className="glass-panel-strong rounded-3xl p-7" aria-busy={loading}>
      <h2 className="text-2xl font-semibold">Recommended plan</h2>
      <p className="my-3 text-sm text-cockpit-muted">
        {selectedSource?.description ??
          "Choose the operational data source used for this planning run."}
      </p>
      <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.8fr)_minmax(300px,1.2fr)_auto] lg:items-end">
        <label className="text-sm text-cockpit-muted">
          <span className="mb-2 block font-medium text-cockpit-text">
            Data source
          </span>
          <select
            aria-label="Data source"
            className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-3 text-cockpit-text"
            value={source}
            onChange={(event) => onSource(event.target.value as DataSourceId)}
            disabled={loading}
          >
            {sources.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-cockpit-muted">
          <span className="mb-2 block font-medium text-cockpit-text">
            Data snapshot
          </span>
          <select
            aria-label="Data snapshot"
            className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-3 text-cockpit-text disabled:opacity-50"
            value={snapshot}
            onChange={(e) => onSnapshot(e.target.value)}
            disabled={loading || !selectedSource?.snapshots.length}
          >
            {!selectedSource?.snapshots.length ? (
              <option value="">No synchronized snapshots</option>
            ) : null}
            {selectedSource?.snapshots.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={loading || !canPlan || !snapshot}
          onClick={onRun}
          className="rounded-xl bg-blue-600 px-5 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-45"
        >
          {loading ? "Working…" : "Generate recommended plan"}
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <span
          className={`rounded-full border px-3 py-1 ${canPlan ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200" : "border-amber-300/20 bg-amber-400/10 text-amber-100"}`}
        >
          {selectedSource?.statusMessage ?? "Source unavailable"}
        </span>
        {selectedSource?.kind === "api" ? (
          <>
            <button
              type="button"
              onClick={onTestConnection}
              disabled={
                sourceActionLoading ||
                !selectedSource.capabilities.canTestConnection
              }
              className="rounded-lg border border-white/10 px-3 py-1.5 text-cockpit-muted disabled:cursor-not-allowed disabled:opacity-45"
            >
              {sourceActionLoading ? "Testing…" : "Test connection"}
            </button>
            <button
              type="button"
              onClick={onSync}
              disabled={
                sourceActionLoading || !selectedSource.capabilities.canSync
              }
              className="rounded-lg border border-white/10 px-3 py-1.5 text-cockpit-muted disabled:cursor-not-allowed disabled:opacity-45"
            >
              {sourceActionLoading ? "Working…" : "Sync data"}
            </button>
          </>
        ) : null}
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
      {source === "databricks-sportswear" ? (
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
          <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-emerald-200">
            AI demand forecast
          </span>
          <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-emerald-200">
            AI store ranking
          </span>
          <span className="rounded-full border border-blue-300/20 bg-blue-400/10 px-3 py-1 text-blue-200">
            Automated orchestration
          </span>
        </div>
      ) : null}
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
              {summary.learned_ranking_active
                ? `Margin ${summary.config.margin_weight * 100}% · service ${summary.config.service_weight * 100}% · AI ranking ${summary.config.ranking_weight * 100}%`
                : "Margin 50% · service 50% · AI ranking unavailable"}
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
