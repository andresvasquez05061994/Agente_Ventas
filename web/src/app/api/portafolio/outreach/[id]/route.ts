import { NextRequest, NextResponse } from "next/server";
import { dataOwnerId, requireUser } from "@/lib/current-user";
import { ensureDb, markGeneratedMessageUsed } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Registra que el vendedor copió el mensaje generado. No envía nada. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const { id: raw } = await params;
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Mensaje no válido" }, { status: 400 });
    }
    const message = await markGeneratedMessageUsed(id, dataOwnerId(actor));
    if (!message) return NextResponse.json({ error: "Mensaje no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, message });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo registrar el uso";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
