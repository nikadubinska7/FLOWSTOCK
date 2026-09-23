import path from "path";
import { randomUUID, createHash } from "crypto";
import { promises as fs } from "fs";
import { loadCsvPackage } from "@/lib/domain/joins";
import {
  latestPackagePath,
  sportswearPackagePath,
  groceryDemoPath,
} from "@/lib/utils/filePaths";
import {
  recommendPlan,
  summarizePlan,
  objectiveConfig,
} from "@/lib/domain/plan";
import { recalculateRows } from "@/lib/domain/kpiCalculations";
import { isApprovalBlocked } from "@/lib/domain/constraints";
import { approveRows } from "@/lib/domain/simulationEngine";
import type { WorkingRow, ApprovalResponse } from "@/lib/domain/types";
import {
  audit,
  locked,
  readState,
  writeState,
  safeId,
  modelRoot,
  stateRoot,
} from "./storage";
export type Run = {
  id: string;
  plan_id: string;
  status: "queued" | "running" | "ready" | "failed";
  approval_state: "pending" | "approved" | "rejected";
  snapshot: string;
  runDate: string;
  rows: WorkingRow[];
  summary?: ReturnType<typeof summarizePlan>;
  error?: string;
  result?: ApprovalResponse;
  created_at: string;
  updated_at: string;
  revision: number;
  source_hash?: string;
  inventory_hash?: string;
  config?: typeof objectiveConfig;
};
export async function snapshotPath(snapshot: string) {
  if (snapshot === "latest") return latestPackagePath();
  if (snapshot === "sportswear") return sportswearPackagePath();
  // Preserve the meaning of existing grocery runs and API clients.
  if (snapshot === "demo") return groceryDemoPath;
  if (snapshot.startsWith("model-")) {
    safeId(snapshot);
    return path.join(modelRoot, snapshot, "package");
  }
  throw new Error("INVALID_SNAPSHOT");
}
async function fingerprint(folder: string, inventoryOnly = false) {
  const names = (await fs.readdir(folder))
    .filter((n) =>
      inventoryOnly
        ? ["dc_inventory.csv", "store_inventory.csv"].includes(n)
        : n.endsWith(".csv"),
    )
    .sort();
  const hash = createHash("sha256");
  for (const n of names)
    hash.update(n).update(await fs.readFile(path.join(folder, n)));
  return hash.digest("hex");
}
export async function getRun(id: string) {
  return readState<Run>(`runs/${safeId(id)}.json`);
}
export async function saveRun(run: Run) {
  run.updated_at = new Date().toISOString();
  await writeState(`runs/${run.id}.json`, run);
}
export async function startRun(snapshot: string, actor: string, key: string) {
  safeId(key);
  await snapshotPath(snapshot);
  return locked(async () => {
    const configHash = createHash("sha256")
      .update(JSON.stringify(objectiveConfig))
      .digest("hex");
    const previousConfig = await readState<{
      hash: string;
      version: string;
    } | null>("objective-config.json", null);
    if (
      previousConfig &&
      previousConfig.hash !== configHash &&
      previousConfig.version === objectiveConfig.version
    )
      throw new Error("CONFIG_VERSION_CHANGE_REQUIRED");
    if (!previousConfig || previousConfig.hash !== configHash) {
      await audit("objective_configuration", actor, {
        previous: previousConfig,
        current: objectiveConfig,
      });
      await writeState("objective-config.json", {
        hash: configHash,
        version: objectiveConfig.version,
      });
    }
    const existing = await readState<{ id: string; snapshot: string } | null>(
      `idempotency/run-${key}.json`,
      null,
    );
    if (existing) {
      if (existing.snapshot !== snapshot)
        throw new Error("IDEMPOTENCY_CONFLICT");
      return getRun(existing.id);
    }
    const id = randomUUID();
    const run: Run = {
      id,
      plan_id: id,
      status: "queued",
      approval_state: "pending",
      snapshot,
      runDate: "",
      rows: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      revision: 0,
      config: { ...objectiveConfig },
    };
    await saveRun(run);
    await writeState(`idempotency/run-${key}.json`, { id, snapshot });
    await audit("run_queued", actor, { id, snapshot, config: objectiveConfig });
    return run;
  });
}
export async function executeRun(id: string) {
  let run = await getRun(id);
  if (run.status !== "queued") return run;
  // A single-process local POC; durable job state survives restarts, queued runs resume on polling.
  return locked(async () => {
    run = await getRun(id);
    if (run.status !== "queued") return run;
    run.status = "running";
    await saveRun(run);
    try {
      const folder = await snapshotPath(run.snapshot);
      const loaded = await loadCsvPackage(folder);
      const registry = await readState<{ champion: string | null }>(
        "registry.json",
        { champion: null },
      );
      let artifactReady = false;
      if (registry.champion) {
        try {
          const folder = path.join(modelRoot, safeId(registry.champion));
          const metadata = JSON.parse(
            await fs.readFile(path.join(folder, "report.json"), "utf8"),
          );
          const binary = await fs.readFile(path.join(folder, "model.pkl"));
          artifactReady =
            createHash("sha256").update(binary).digest("hex") ===
            metadata.artifact_checksum;
        } catch {
          artifactReady = false;
        }
      }
      const base = loaded.rows.map((r) => {
        const valid =
          r.forecastEligible !== false &&
          artifactReady &&
          registry.champion === r.modelVersion &&
          r.modelForecast !== undefined &&
          Number.isFinite(r.modelForecast) &&
          r.modelForecast >= 0;
        return valid
          ? {
              ...r,
              forecastNext14: r.modelForecast!,
              forecastNext7: r.modelForecast! / 2,
              averageDailySales: r.modelForecast! / 14,
              forecastFallback: false,
            }
          : { ...r, forecastFallback: true };
      });
      run.rows = recommendPlan(base, run.config ?? objectiveConfig);
      run.summary = summarizePlan(run.rows, run.config ?? objectiveConfig);
      run.runDate = loaded.runDate;
      run.source_hash = await fingerprint(folder);
      run.inventory_hash = await fingerprint(folder, true);
      run.status = "ready";
      await audit("plan_ready", "system", {
        id,
        config: objectiveConfig,
        summary: run.summary,
      });
    } catch (e) {
      run.status = "failed";
      run.error = e instanceof Error ? e.message : "RUN_FAILED";
      await audit("run_failed", "system", { id, error: run.error });
    }
    await saveRun(run);
    return run;
  });
}
export async function overrideRun(
  id: string,
  edits: { id: string; finalQty: number; comment: string }[],
  actor: string,
  revision: number,
) {
  return locked(async () => {
    const run = await getRun(id);
    if (run.status !== "ready" || run.approval_state !== "pending")
      throw new Error("PLAN_NOT_EDITABLE");
    if (run.revision !== revision) throw new Error("REVISION_CONFLICT");
    const map = new Map(edits.map((e) => [e.id, e]));
    if (
      map.size !== edits.length ||
      edits.some((e) => !run.rows.some((r) => r.id === e.id))
    )
      throw new Error("UNKNOWN_OR_DUPLICATE_ROW");
    for (const e of edits)
      if (
        !Number.isSafeInteger(e.finalQty) ||
        e.finalQty < 0 ||
        !e.comment.trim()
      )
        throw new Error("OVERRIDE_REQUIRES_QUANTITY_AND_REASON");
    run.rows = recalculateRows(
      run.rows.map((r) => (map.has(r.id) ? { ...r, ...map.get(r.id) } : r)),
    );
    run.revision++;
    run.summary = summarizePlan(run.rows, run.config ?? objectiveConfig);
    await saveRun(run);
    await audit("planner_override", actor, {
      id,
      revision: run.revision,
      edits,
    });
    return run;
  });
}
export async function decideRun(
  id: string,
  action: "approve" | "reject",
  ids: string[],
  createDocs: boolean,
  actor: string,
  reason: string,
) {
  return locked(async () => {
    const run = await getRun(id);
    if (
      run.approval_state === action + "d" ||
      (action === "reject" && run.approval_state === "rejected")
    )
      return run;
    if (run.status !== "ready" || run.approval_state !== "pending")
      throw new Error("PLAN_NOT_PENDING");
    if (action === "reject") {
      run.approval_state = "rejected";
      await saveRun(run);
      await audit("plan_rejected", actor, { id, reason });
      return run;
    }
    if (
      !ids.length ||
      new Set(ids).size !== ids.length ||
      ids.some((x) => !run.rows.some((r) => r.id === x))
    )
      throw new Error("INVALID_SELECTED_ROWS");
    const folder = await snapshotPath(run.snapshot);
    if ((await fingerprint(folder)) !== run.source_hash)
      throw new Error("STALE_SNAPSHOT");
    const consumed = await readState<string[]>("consumed-snapshots.json", []);
    if (consumed.includes(run.inventory_hash ?? run.source_hash!))
      throw new Error("SNAPSHOT_ALREADY_APPROVED");
    const selected = new Set(ids);
    const check = recalculateRows(
      run.rows.map((r) => ({
        ...r,
        finalQty: selected.has(r.id) ? r.finalQty : 0,
        comment: selected.has(r.id) ? r.comment : "Excluded from this approval",
      })),
    );
    const approved = check.filter((r) => selected.has(r.id) && r.finalQty > 0);
    const budget = (run.config ?? objectiveConfig).budget as number | null;
    if (
      budget !== null &&
      approved.reduce((sum, r) => sum + r.finalQty * r.unitCost, 0) > budget
    )
      throw new Error("BUDGET_EXCEEDED");
    if (!approved.length || approved.some(isApprovalBlocked))
      throw new Error("CONSTRAINT_VIOLATION");
    // Reserve snapshot before side effects. Failure requires review, never blind duplicate shipping.
    await writeState("consumed-snapshots.json", [
      ...consumed,
      run.inventory_hash ?? run.source_hash,
    ]);
    run.result = await approveRows(
      run.runDate,
      run.plan_id,
      approved,
      createDocs,
      folder,
    );
    run.approval_state = "approved";
    await saveRun(run);
    await audit("plan_approved", actor, {
      id,
      reason,
      rows: approved.map((r) => ({
        id: r.id,
        original: r.systemRecommendedQty,
        final: r.finalQty,
        comment: r.comment,
      })),
      result: run.result,
    });
    return run;
  });
}

export async function runHistory() {
  let names: string[] = [];
  try {
    names = await fs.readdir(path.join(stateRoot, "runs"));
  } catch {}
  const runs = await Promise.all(
    names
      .filter((n) => n.endsWith(".json"))
      .map((n) => readState<Run>(`runs/${n}`)),
  );
  return runs
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(({ rows, ...r }) => ({ ...r, total: rows.length }));
}
