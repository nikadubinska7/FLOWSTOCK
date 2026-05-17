import { NextResponse } from "next/server";
import { loadCsvPackage } from "@/lib/domain/joins";
import { calculateKpis } from "@/lib/domain/kpiCalculations";
import { compareScenarios } from "@/lib/domain/replenishmentEngine";
import { latestPackagePath, packageLabel } from "@/lib/utils/filePaths";

export const dynamic = "force-dynamic";

export async function GET() {
  const packagePath = await latestPackagePath();
  const loaded = await loadCsvPackage(packagePath);
  const currentKpis = calculateKpis(loaded.rows, false);

  return NextResponse.json({
    packagePath: packageLabel(packagePath),
    runDate: loaded.runDate,
    rows: loaded.rows,
    currentKpis,
    simulationKpis: currentKpis,
    scenarioComparison: compareScenarios(loaded.rows),
    dataIssues: loaded.dataIssues,
    runHistory: loaded.runHistory
  });
}
