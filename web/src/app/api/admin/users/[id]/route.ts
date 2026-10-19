import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireUser } from "@/lib/current-user";
import { ensureDb } from "@/lib/db";
import { setUserStatus, type UserStatus } from "@/lib/users";

export const dynamic = "force-dynamic";

const STATUSES = new Set<UserStatus>(["approved", "rejected", "disabled", "pending"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const denied = requireAdmin(actor);
    if (denied) return denied;

    const { id } = await params;
    const userId = Number(id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: "Usuario no válido." }, { status: 400 });
    }
    const body = (await req.json()) as { status?: string };
    const status = String(body.status ?? "") as UserStatus;
    if (!STATUSES.has(status)) {
      return NextResponse.json({ error: "Estado no válido." }, { status: 400 });
    }
    const user = await setUserStatus(userId, status);
    return NextResponse.json({ user });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo actualizar el usuario";
    const http = /no se puede cambiar/i.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status: http });
  }
}
