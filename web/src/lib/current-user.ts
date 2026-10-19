import { NextResponse, type NextRequest } from "next/server";
import { readSessionUserId, SESSION_COOKIE, unauthorizedJson } from "./auth";
import type { AppUser } from "./users";
import { getUserById } from "./users";

export function dataOwnerId(user: AppUser): number | null {
  return user.role === "admin" ? null : user.id;
}

export async function requireUser(req: NextRequest): Promise<AppUser | NextResponse> {
  const userId = readSessionUserId(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return unauthorizedJson();
  const user = await getUserById(userId);
  if (!user || user.status !== "approved") return unauthorizedJson();
  return user;
}

export function requireAdmin(user: AppUser): NextResponse | null {
  if (user.role === "admin") return null;
  return NextResponse.json({ error: "Solo el administrador puede hacer esto." }, { status: 403 });
}
