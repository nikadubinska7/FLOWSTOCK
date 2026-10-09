import { promises as fs } from "fs";
import path from "path";
import { prepareSportswearPackage } from "../domain/sportswearPackage";
import type { DataSourceId } from "../dataSources/types";

export const projectRoot = process.cwd();
export const seedPackagePath = path.join(
  projectRoot,
  "data",
  "seed",
  "replenishment_mock_csv_package",
);
export const groceryDemoPath = path.join(
  projectRoot,
  "data",
  "seed",
  "grocery_demo",
);
export const runsRoot =
  process.env.FLOWSTOCK_RUNS_DIR ||
  path.join(projectRoot, "data", "local", "sportswear_runs");

export function sourceRunsRoot(sourceId: DataSourceId): string {
  if (sourceId === "sportswear-csv") return runsRoot;
  if (sourceId === "databricks-sportswear")
    return (
      process.env.FLOWSTOCK_DATABRICKS_RUNS_DIR ||
      path.join(projectRoot, "data", "local", "databricks_sportswear_runs")
    );
  if (sourceId === "grocery-research")
    return (
      process.env.FLOWSTOCK_GROCERY_RUNS_DIR ||
      path.join(projectRoot, "data", "local", "grocery_runs")
    );
  return (
    process.env.FLOWSTOCK_BC_RUNS_DIR ||
    path.join(projectRoot, "data", "local", "business_central_runs")
  );
}

export function sportswearPackagePath(): Promise<string> {
  return prepareSportswearPackage(seedPackagePath, runsRoot);
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function latestPackagePath(): Promise<string> {
  return latestPackagePathForSource("sportswear-csv");
}

export async function latestPackagePathForSource(
  sourceId: DataSourceId,
): Promise<string> {
  const root = sourceRunsRoot(sourceId);
  const fallback =
    sourceId === "sportswear-csv"
      ? await sportswearPackagePath()
      : sourceId === "grocery-research"
        ? groceryDemoPath
        : null;
  if (!fallback) throw new Error("SOURCE_NOT_CONNECTED");
  if (!(await pathExists(root))) return fallback;
  try {
    const active = JSON.parse(
      await fs.readFile(path.join(root, "active.json"), "utf8"),
    );
    if (/^\d{4}-\d{2}-\d{2}$/.test(active.date)) {
      const candidate = path.join(
        root,
        active.date,
        ...(typeof active.approval_id === "string" &&
        /^APR-[0-9-]+$/.test(active.approval_id)
          ? [active.approval_id]
          : []),
        "input",
      );
      if (await pathExists(path.join(candidate, "simulation_state.csv")))
        return candidate;
    }
  } catch {}
  const entries = await fs.readdir(root, { withFileTypes: true });
  const runDirs = entries
    .filter(
      (entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort();

  for (const runDate of runDirs.reverse()) {
    const inputPath = path.join(root, runDate, "input");
    if (await pathExists(path.join(inputPath, "simulation_state.csv")))
      return inputPath;
  }

  return fallback;
}

export function packageLabel(packagePath: string): string {
  return packagePath.replace(`${projectRoot}${path.sep}`, "");
}

export function outputRootForRun(runDate: string): string {
  return outputRootForSource("sportswear-csv", runDate);
}

export function nextInputPath(
  nextRunDate: string,
  approvalId?: string,
): string {
  return nextInputPathForSource("sportswear-csv", nextRunDate, approvalId);
}

export function outputRootForSource(
  sourceId: DataSourceId,
  runDate: string,
): string {
  return path.join(sourceRunsRoot(sourceId), runDate, "output");
}

export function nextInputPathForSource(
  sourceId: DataSourceId,
  nextRunDate: string,
  approvalId?: string,
): string {
  return path.join(
    sourceRunsRoot(sourceId),
    nextRunDate,
    ...(approvalId ? [approvalId] : []),
    "input",
  );
}
