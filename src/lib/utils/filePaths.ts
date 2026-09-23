import { promises as fs } from "fs";
import path from "path";
import { prepareSportswearPackage } from "../domain/sportswearPackage";

export const projectRoot = process.cwd();
export const seedPackagePath = path.join(projectRoot, "data", "seed", "replenishment_mock_csv_package");
export const groceryDemoPath = path.join(projectRoot, "data", "seed", "grocery_demo");
export const runsRoot = process.env.FLOWSTOCK_RUNS_DIR || path.join(projectRoot, "data", "local", "sportswear_runs");

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
  if (!(await pathExists(runsRoot))) return sportswearPackagePath();
  try {
    const active = JSON.parse(await fs.readFile(path.join(runsRoot, "active.json"), "utf8"));
    if (/^\d{4}-\d{2}-\d{2}$/.test(active.date)) {
      const candidate = path.join(runsRoot, active.date, ...(typeof active.approval_id === "string" && /^APR-[0-9-]+$/.test(active.approval_id) ? [active.approval_id] : []), "input");
      if (await pathExists(path.join(candidate,"simulation_state.csv"))) return candidate;
    }
  } catch {}
  const entries = await fs.readdir(runsRoot, { withFileTypes: true });
  const runDirs = entries
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  for (const runDate of runDirs.reverse()) {
    const inputPath = path.join(runsRoot, runDate, "input");
    if (await pathExists(path.join(inputPath, "simulation_state.csv"))) return inputPath;
  }

  return sportswearPackagePath();
}

export function packageLabel(packagePath: string): string {
  return packagePath.replace(`${projectRoot}${path.sep}`, "");
}

export function outputRootForRun(runDate: string): string {
  return path.join(runsRoot, runDate, "output");
}

export function nextInputPath(nextRunDate: string, approvalId?: string): string {
  return path.join(runsRoot, nextRunDate, ...(approvalId ? [approvalId] : []), "input");
}
