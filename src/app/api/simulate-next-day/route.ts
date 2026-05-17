import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({
    message: "The next-day package is generated automatically after approval."
  });
}
