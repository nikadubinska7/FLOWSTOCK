import { NextRequest, NextResponse } from "next/server";
import type { ScenarioKey, WorkingRow } from "@/lib/domain/types";
import { calculateKpis } from "@/lib/domain/kpiCalculations";
import { recommendRows } from "@/lib/domain/replenishmentEngine";
import { loadCsvPackage } from "@/lib/domain/joins";
import { latestPackagePath } from "@/lib/utils/filePaths";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { scenario: ScenarioKey; rows: WorkingRow[] };
  const baseRows = body.rows?.length ? body.rows : (await loadCsvPackage(await latestPackagePath())).rows;
  const rows = recommendRows(baseRows, body.scenario);

  return NextResponse.json({
    rows,
    simulationKpis: calculateKpis(rows, true)
  });
}
