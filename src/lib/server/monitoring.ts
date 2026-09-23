export type Outcome = {
  actual: number;
  predicted: number;
  baseline: number;
  lower: number;
  upper: number;
  fallback: boolean;
  store_id: string;
  category: string;
};
export function monitorOutcomes(rows: Outcome[]) {
  if (!rows.length) return { status: "not enough evidence", count: 0 };
  if (
    rows.some(
      (r) =>
        ![r.actual, r.predicted, r.baseline, r.lower, r.upper].every(
          Number.isFinite,
        ) ||
        r.actual < 0 ||
        r.predicted < 0 ||
        r.lower < 0 ||
        r.lower > r.upper,
    )
  )
    throw new Error("INVALID_OUTCOME_DATA");
  const total = rows.reduce((s, r) => s + r.actual, 0),
    error = rows.reduce((s, r) => s + Math.abs(r.actual - r.predicted), 0),
    bias = rows.reduce((s, r) => s + r.predicted - r.actual, 0);
  const fallback = rows.filter((r) => r.fallback).length / rows.length;
  return {
    status: "measured",
    count: rows.length,
    wape: total ? error / total : null,
    mae: error / rows.length,
    relative_bias: total ? bias / total : null,
    interval_coverage:
      rows.filter((r) => r.actual >= r.lower && r.actual <= r.upper).length /
      rows.length,
    fallback_rate: fallback,
    mean_prediction_shift_vs_baseline:
      rows.reduce((s, r) => s + r.predicted - r.baseline, 0) / rows.length,
  };
}
