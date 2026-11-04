import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { ensureDb } from "@/lib/db";
import {
  deleteSellerSolution,
  type SellerSolutionInput,
  updateSellerSolution,
} from "@/lib/seller-solutions";

export const dynamic = "force-dynamic";

function readId(raw: string): number | null {
  const id = Number(raw);
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
    const id = readId(rawId);
    if (!id) return NextResponse.json({ error: "ID de solución no válido" }, { status: 400 });
    const body = (await req.json().catch(() => ({}))) as Partial<SellerSolutionInput>;
    const solution = await updateSellerSolution(actor.id, id, body);
    if (!solution) return NextResponse.json({ error: "Solución no encontrada" }, { status: 404 });
    return NextResponse.json({ solution });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo actualizar la solución";
    return NextResponse.json({ error: message }, { status: /Escribe/i.test(message) ? 400 : 500 });
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
    const id = readId(rawId);
    if (!id) return NextResponse.json({ error: "ID de solución no válido" }, { status: 400 });
    const deleted = await deleteSellerSolution(actor.id, id);
    if (!deleted) return NextResponse.json({ error: "Solución no encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo eliminar la solución";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
