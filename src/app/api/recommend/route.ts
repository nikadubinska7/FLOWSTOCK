import {NextResponse} from "next/server";
export async function POST(){return NextResponse.json({error:{code:"USE_RUN_API",message:"Use /api/v1/runs with one plan and server-side approval."}},{status:410});}
