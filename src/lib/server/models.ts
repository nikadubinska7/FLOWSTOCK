import path from "path";
import { promises as fs } from "fs";
import { createHash, randomUUID } from "crypto";
import { spawn } from "child_process";
import gates from "../../../config/promotion_gates.json";
import {
  audit,
  readState,
  writeState,
  locked,
  safeId,
  modelRoot,
} from "./storage";
import { loadCsvPackage } from "@/lib/domain/joins";
import { recommendPlan, summarizePlan } from "@/lib/domain/plan";
export type ModelReport = {
  version: string;
  state: string;
  source: {
    source_origin: string;
    splits: Record<string, string>;
    revision: string;
    selected_stores?: unknown;
  };
  artifact_path: string;
  artifact_checksum: string;
  recommended_champion: string;
  validation: { ml: Metric; seasonal: Metric; moving: Metric };
  test: { ml: Metric; seasonal: Metric; moving: Metric };
  coverage: number;
  fallback_rate: number;
  constraint_violations: number | null;
  inference_tests_passed: boolean;
  data_tests_passed: boolean;
  created_at: string;
  ranking: Record<string, unknown>;
  [key: string]: unknown;
};
type Metric = {
  wape: number | null;
  relative_bias: number | null;
  mae: number;
  count: number;
};
type Registry = {
  champion: string | null;
  models: Record<
    string,
    {
      state: string;
      approved_by?: string;
      approved_at?: string;
      reason?: string;
    }
  >;
};
export async function registry() {
  return readState<Registry>("registry.json", { champion: null, models: {} });
}
export async function report(id: string): Promise<ModelReport> {
  return JSON.parse(
    await fs.readFile(path.join(modelRoot, safeId(id), "report.json"), "utf8"),
  );
}
export function evaluateGates(r: ModelReport) {
  const a = r.test.ml,
    base = Math.min(
      r.test.seasonal.wape ?? Infinity,
      r.test.moving.wape ?? Infinity,
    );
  const checks = {
    finite_metrics:
      [a.wape, a.relative_bias, a.mae, r.coverage, r.fallback_rate].every(
        (v) => typeof v === "number" && Number.isFinite(v),
      ) &&
      (a.wape ?? -1) >= 0 &&
      a.mae >= 0 &&
      r.coverage >= 0 &&
      r.coverage <= 1 &&
      r.fallback_rate >= 0 &&
      r.fallback_rate <= 1,
    data: r.data_tests_passed === true,
    inference: r.inference_tests_passed === true,
    evidence: a.count >= gates.minimum_test_cases,
    accuracy:
      a.wape !== null &&
      Number.isFinite(base) &&
      a.wape <= base + gates.wape_regression_tolerance,
    bias:
      a.relative_bias !== null &&
      Math.abs(a.relative_bias) <= gates.max_absolute_relative_bias,
    coverage: r.coverage >= gates.minimum_coverage,
    fallback: r.fallback_rate <= gates.maximum_fallback_rate,
    constraints: r.constraint_violations === 0,
  };
  return {
    version: gates.version,
    checks,
    passed: Object.values(checks).every(Boolean),
    evidence: "held-out offline evaluation; no real operational pilot evidence",
  };
}
export async function inspect(id: string) {
  const r = await report(id);
  const binary = await fs.readFile(
    path.join(modelRoot, safeId(id), "model.pkl"),
  );
  if (createHash("sha256").update(binary).digest("hex") !== r.artifact_checksum)
    throw new Error("ARTIFACT_CHECKSUM_MISMATCH");
  const loaded = await loadCsvPackage(
    path.join(modelRoot, safeId(id), "package"),
  );
  const rows = loaded.rows.map((x) => ({
    ...x,
    forecastNext14: x.modelForecast ?? x.forecastNext14,
    forecastFallback: false,
  }));
  const plan = recommendPlan(rows);
  const summary = summarizePlan(plan);
  const baselineSimulation = summarizePlan(recommendPlan(loaded.rows));
  r.constraint_violations = summary.constraint_violations;
  const reg = await registry();
  let championComparison: unknown = {
    champion: "deterministic-v1",
    comparable: true,
    baseline_wape: Math.min(
      r.test.seasonal.wape ?? Infinity,
      r.test.moving.wape ?? Infinity,
    ),
  };
  let championPassed = true;
  if (reg.champion && reg.champion !== id) {
    const old = await report(reg.champion);
    const comparable =
      JSON.stringify(old.source.splits) === JSON.stringify(r.source.splits) &&
      old.source.revision === r.source.revision &&
      JSON.stringify(old.source.selected_stores) ===
        JSON.stringify(r.source.selected_stores) &&
      old.horizon === r.horizon;
    championPassed =
      comparable &&
      r.test.ml.wape !== null &&
      old.test.ml.wape !== null &&
      r.test.ml.wape <= old.test.ml.wape + gates.wape_regression_tolerance;
    championComparison = {
      champion: reg.champion,
      comparable,
      wape: old.test.ml.wape,
      passed: championPassed,
    };
  }
  const gate = evaluateGates(r);
  gate.passed = gate.passed && championPassed;
  return {
    report: r,
    gates: gate,
    championComparison,
    simulation: summary,
    baselineSimulation,
    simulated_difference: {
      expected_margin:
        summary.expected_margin - baselineSimulation.expected_margin,
      service_level:
        summary.projected_service_after -
        baselineSimulation.projected_service_after,
      allocated_units:
        summary.stock.reduce((s, r) => s + r.allocated, 0) -
        baselineSimulation.stock.reduce((s, r) => s + r.allocated, 0),
    },
  };
}
export async function modelAction(
  id: string,
  action: string,
  actor: string,
  reason: string,
) {
  return locked(async () => {
    const r = await inspect(id);
    const reg = await registry();
    const current = reg.models[id] ?? { state: "candidate" };
    if (action === "reject") {
      if (reg.champion === id) throw new Error("CANNOT_REJECT_ACTIVE_MODEL");
      reg.models[id] = { ...current, state: "rejected", reason };
    } else if (action === "approve") {
      if (!r.gates.passed) throw new Error("PROMOTION_GATE_FAILED");
      reg.models[id] = {
        state: "approved",
        approved_by: actor,
        approved_at: new Date().toISOString(),
        reason,
      };
    } else if (action === "activate" || action === "rollback") {
      if (
        !current.approved_by ||
        !["approved", "rolled_back", "champion"].includes(current.state)
      )
        throw new Error("HUMAN_APPROVAL_REQUIRED");
      if (!r.gates.passed && action !== "rollback")
        throw new Error("PROMOTION_GATE_FAILED");
      if (reg.champion && reg.champion !== id)
        reg.models[reg.champion] = {
          ...reg.models[reg.champion],
          state: "rolled_back",
        };
      reg.champion = id;
      reg.models[id] = { ...current, state: "champion", reason };
    } else throw new Error("INVALID_MODEL_ACTION");
    await writeState("registry.json", reg);
    await audit(`model_${action}`, actor, { id, reason, gates: r.gates });
    return reg;
  });
}
export async function modelHealth() {
  const reg = await registry();
  let dirs: string[] = [];
  try {
    dirs = await fs.readdir(modelRoot);
  } catch {}
  const models = [];
  for (const id of dirs.filter((x) => x.startsWith("model-")).sort()) {
    try {
      await fs.access(path.join(modelRoot, id, "predictions.json"));
      const r = await report(id);
      models.push({
        id,
        state: reg.models[id]?.state ?? "candidate",
        created_at: r.created_at,
        test: r.test,
        source: r.source,
        approved_at: reg.models[id]?.approved_at,
      });
    } catch {}
  }
  return {
    champion: reg.champion ?? "deterministic-v1",
    models,
    post_deployment: "not enough evidence",
    data_freshness: models.at(-1)?.source.splits.test_end ?? null,
    gate_config: gates,
  };
}
export async function pipelineJob(
  command: "train" | "ingest",
  source: string,
  actor: string,
  key: string,
) {
  safeId(key);
  if (!["offline", "smoke", "freshretailnet"].includes(source))
    throw new Error("INVALID_SOURCE");
  return locked(async () => {
    const old = await readState<{
      id: string;
      command: string;
      source: string;
    } | null>(`idempotency/job-${key}.json`, null);
    if (old) {
      if (old.source !== source || old.command !== command)
        throw new Error("IDEMPOTENCY_CONFLICT");
      return readState(`jobs/${old.id}.json`);
    }
    const id = randomUUID();
    const job = {
      id,
      status: "running",
      command,
      source,
      created_at: new Date().toISOString(),
    };
    await writeState(`jobs/${id}.json`, job);
    await writeState(`idempotency/job-${key}.json`, { id, source, command });
    await audit("pipeline_started", actor, job);
    const args =
      command === "train"
        ? ["ml/pipeline.py", "train", "--source", source]
        : source === "offline"
          ? ["ml/pipeline.py", "offline"]
          : [
              "ml/pipeline.py",
              "ingest",
              ...(source === "smoke" ? ["--smoke-test"] : []),
            ];
    const child = spawn(
      process.env.FLOWSTOCK_PYTHON ||
        path.join(process.cwd(), ".venv/bin/python"),
      args,
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          OMP_NUM_THREADS: "4",
          LOKY_MAX_CPU_COUNT: "4",
          HF_HOME: path.join(process.cwd(), "data/local/cache"),
        },
      },
    );
    let output = "",
      error = "";
    child.stdout.on("data", (d) => {
      output = (output + d.toString()).slice(-50000);
    });
    child.stderr.on("data", (d) => {
      error = (error + d.toString()).slice(-10000);
    });
    const finish = async (status: string) => {
      await writeState(`jobs/${id}.json`, {
        ...job,
        status,
        output,
        error: error.replaceAll(
          process.env.HF_TOKEN ?? "__unset__",
          "[redacted]",
        ),
        finished_at: new Date().toISOString(),
      });
      await audit("pipeline_finished", actor, { id, status });
    };
    child.on("error", () => {
      void finish("failed");
    });
    child.on("close", (code) => {
      void finish(code === 0 ? "completed" : "failed");
    });
    return job;
  });
}
