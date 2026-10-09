import { NextRequest, NextResponse } from "next/server";
import { hasSession, isAuthConfigured, isAuthRequired } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return NextResponse.json({
    required: isAuthRequired(),
    configured: isAuthConfigured(),
    authenticated: hasSession(req),
  });
}
