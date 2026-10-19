import { NextRequest, NextResponse } from "next/server";
import { isAuthConfigured, isAuthRequired, readSessionUserId, SESSION_COOKIE } from "@/lib/auth";
import { ensureDb } from "@/lib/db";
import { getUserById } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = readSessionUserId(req.cookies.get(SESSION_COOKIE)?.value);
  let user = null;
  if (userId) {
    try {
      await ensureDb();
      const found = await getUserById(userId);
      if (found && found.status === "approved") {
        user = { id: found.id, email: found.email, role: found.role, status: found.status };
      }
    } catch {
      user = null;
    }
  }

  return NextResponse.json({
    required: isAuthRequired(),
    configured: isAuthConfigured(),
    authenticated: Boolean(user),
    user,
  });
}
