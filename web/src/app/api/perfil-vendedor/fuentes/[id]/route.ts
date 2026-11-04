import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { ensureDb } from "@/lib/db";
import {
  deleteSellerWebSource,
  setSellerWebSourceActive,
} from "@/lib/seller-web-sources";

export const dynamic = "force-dynamic";

function sourceId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const { id: rawId } = await params;
    const id = sourceId(rawId);
    if (!id) return NextResponse.json({ error: "ID de fuente no válido" }, { status: 400 });
    const body = (await req.json().catch(() => ({}))) as { active?: unknown };
    if (typeof body.active !== "boolean") {
      return NextResponse.json({ error: "Indica si la fuente debe estar activa." }, { status: 400 });
    }
    const source = await setSellerWebSourceActive(actor.id, id, body.active);
    if (!source) return NextResponse.json({ error: "Fuente no encontrada" }, { status: 404 });
    return NextResponse.json({ source });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo actualizar la fuente";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const { id: rawId } = await params;
    const id = sourceId(rawId);
    if (!id) return NextResponse.json({ error: "ID de fuente no válido" }, { status: 400 });
    const deleted = await deleteSellerWebSource(actor.id, id);
    if (!deleted) return NextResponse.json({ error: "Fuente no encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo eliminar la fuente";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
