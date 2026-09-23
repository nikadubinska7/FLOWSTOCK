import {authenticate} from "@/lib/server/auth";
import { NextRequest, NextResponse } from "next/server";
import { loadCsvPackage } from "@/lib/domain/joins";
import { calculateKpis } from "@/lib/domain/kpiCalculations";

import { latestPackagePath, packageLabel } from "@/lib/utils/filePaths";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try { await authenticate(request); } catch { return NextResponse.json({error:{code:"AUTH_REQUIRED"}},{status:401}); }
  const packagePath = await latestPackagePath();
  const loaded = await loadCsvPackage(packagePath);
  const currentKpis = calculateKpis(loaded.rows, false);

  return NextResponse.json({
    packagePath: packageLabel(packagePath),
    runDate: loaded.runDate,
    rows: loaded.rows,
    currentKpis,
    simulationKpis: currentKpis,
    dataIssues: loaded.dataIssues,
    runHistory: loaded.runHistory
  });
}
