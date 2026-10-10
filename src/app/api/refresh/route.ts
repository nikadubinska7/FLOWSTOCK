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
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

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
    if (
      process.env.NEXT_PUBLIC_FLOWSTOCK_V3_ONLY === "1" &&
      source === "databricks-sportswear" &&
      ["2026-06-30", "latest"].includes(snapshot)
    ) {
      const artifact = path.join(
        process.cwd(),
        "data",
        "seed",
        "flowstock_v3_refresh.json.gz",
      );
      const artifactStat = await stat(artifact);
      const body = Readable.toWeb(createReadStream(artifact));
      return new Response(body as unknown as BodyInit, {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Encoding": "gzip",
          "Content-Length": String(artifactStat.size),
          "Content-Type": "application/json; charset=utf-8",
        },
      });
    }
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
