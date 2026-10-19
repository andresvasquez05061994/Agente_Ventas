import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireUser } from "@/lib/current-user";
import { ensureDb } from "@/lib/db";
import { listUserAccounts } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const denied = requireAdmin(actor);
    if (denied) return denied;
    const users = await listUserAccounts();
    return NextResponse.json({ users });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudieron leer los usuarios";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
