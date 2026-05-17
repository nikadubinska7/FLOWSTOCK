import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    message: "Exports are written as CSV files under data/runs after approval."
  });
}
