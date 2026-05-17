import { NextRequest, NextResponse } from "next/server";
import type { ApprovalRequest } from "@/lib/domain/types";
import { approveRows } from "@/lib/domain/simulationEngine";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ApprovalRequest & { runDate: string };
  const result = await approveRows(body.runDate, body.scenario, body.rows, body.createShippingDocs);
  return NextResponse.json(result);
}
