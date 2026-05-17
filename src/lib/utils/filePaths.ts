import { promises as fs } from "fs";
import path from "path";

export const projectRoot = process.cwd();
export const seedPackagePath = path.join(projectRoot, "data", "seed", "replenishment_mock_csv_package");
export const runsRoot = path.join(projectRoot, "data", "runs");

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function latestPackagePath(): Promise<string> {
  if (!(await pathExists(runsRoot))) return seedPackagePath;
  const entries = await fs.readdir(runsRoot, { withFileTypes: true });
  const runDirs = entries
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  for (const runDate of runDirs.reverse()) {
    const inputPath = path.join(runsRoot, runDate, "input");
    if (await pathExists(path.join(inputPath, "simulation_state.csv"))) return inputPath;
  }

  return seedPackagePath;
}

export function packageLabel(packagePath: string): string {
  return packagePath.replace(`${projectRoot}${path.sep}`, "");
}

export function outputRootForRun(runDate: string): string {
  return path.join(runsRoot, runDate, "output");
}

export function nextInputPath(nextRunDate: string): string {
  return path.join(runsRoot, nextRunDate, "input");
}
