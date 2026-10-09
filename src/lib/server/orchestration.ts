import { audit } from "./storage";
import { syncDatabricksSnapshot } from "./databricks";
import { executeRun, startRun } from "./runs";

/**
 * Nightly orchestration is deliberately idempotent per published snapshot.
 * Repeated scheduler calls return the same planning run instead of consuming
 * inventory or creating duplicate recommendations.
 */
export async function orchestrateDatabricksPlanning(actor: string) {
  const synchronization = await syncDatabricksSnapshot();
  const run = await startRun(
    synchronization.snapshotId,
    actor,
    `nightly-${synchronization.snapshotId}`,
    "databricks-sportswear",
  );
  const completed = await executeRun(run.id);
  await audit("databricks_nightly_orchestration", actor, {
    snapshotId: synchronization.snapshotId,
    rows: synchronization.rows,
    runId: completed.id,
    status: completed.status,
    modelForecastRows: completed.rows.filter(
      (row) => row.forecastFallback === false,
    ).length,
    learnedRankingRows: completed.rows.filter(
      (row) => typeof row.rankingScore === "number",
    ).length,
  });
  return {
    synchronization,
    run: {
      id: completed.id,
      status: completed.status,
      snapshot: completed.snapshot,
      runDate: completed.runDate,
      rows: completed.rows.length,
      modelForecastRows: completed.rows.filter(
        (row) => row.forecastFallback === false,
      ).length,
      learnedRankingRows: completed.rows.filter(
        (row) => typeof row.rankingScore === "number",
      ).length,
      summary: completed.summary,
      error: completed.error,
    },
  };
}
