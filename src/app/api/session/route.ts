import { NextRequest,NextResponse } from "next/server";
import {keys,localRequest} from "@/lib/server/auth";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const origin=req.headers.get("origin");
 if(!localRequest(req)||origin&&new URL(origin).host!==req.headers.get("host")) return NextResponse.json({error:"FORBIDDEN_ORIGIN"},{status:403});
 // Explicit local-only demo identity; remote deployments must provide a bearer token.
 if(process.env.FLOWSTOCK_AUTH_MODE==="required") return NextResponse.json({error:"AUTH_REQUIRED"},{status:401});
 const access=await keys();const res=NextResponse.json({identity:"local-planner",mode:"local-only demo"});
 res.cookies.set("flowstock_session",access.planner,{httpOnly:true,sameSite:"strict",path:"/",maxAge:8*3600});return res;
}
