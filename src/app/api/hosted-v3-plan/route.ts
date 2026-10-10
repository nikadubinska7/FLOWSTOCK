import { authenticate } from "@/lib/server/auth";
import { NextRequest, NextResponse } from "next/server";
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
  if (process.env.NEXT_PUBLIC_FLOWSTOCK_V3_ONLY !== "1") {
    return NextResponse.json(
      { error: { code: "NOT_FOUND" } },
      { status: 404 },
    );
  }
  const artifact = path.join(
    process.cwd(),
    "data",
    "seed",
    "flowstock_v3_plan.json.gz",
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
