import { authenticate } from "@/lib/server/auth";
import { NextRequest, NextResponse } from "next/server";
import { loadCsvPackage } from "@/lib/domain/joins";
import { calculateKpis } from "@/lib/domain/kpiCalculations";

import { packageLabel } from "@/lib/utils/filePaths";
import {
  inferDataSource,
  isDataSourceId,
  resolveDataSnapshot,
} from "@/lib/server/dataSources";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await authenticate(request);
  } catch {
    return NextResponse.json(
      { error: { code: "AUTH_REQUIRED" } },
      { status: 401 },
    );
  }
  try {
    const snapshot = request.nextUrl.searchParams.get("snapshot") ?? "latest";
    const requestedSource = request.nextUrl.searchParams.get("source");
    const source = requestedSource ?? inferDataSource(snapshot);
    if (!isDataSourceId(source)) throw new Error("INVALID_DATA_SOURCE");
    const packagePath = await resolveDataSnapshot(source, snapshot);
    const loaded = await loadCsvPackage(packagePath);
    const currentKpis = calculateKpis(loaded.rows, false);

    return NextResponse.json({
      source,
      snapshot,
      packagePath: packageLabel(packagePath),
      runDate: loaded.runDate,
      rows: loaded.rows,
      currentKpis,
      simulationKpis: currentKpis,
      dataIssues: loaded.dataIssues,
      runHistory: loaded.runHistory,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "REFRESH_FAILED";
    return NextResponse.json(
      { error: { code, message: code } },
      { status: code === "SOURCE_NOT_CONNECTED" ? 409 : 400 },
    );
  }
}
