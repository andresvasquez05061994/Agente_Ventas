import { NextRequest, NextResponse } from "next/server";
import { deleteLead, initDb, updateLeadNotes, updateLeadStatus } from "@/lib/db";
import type { LeadStatus } from "@/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initDb();
    const { id } = await params;
    const body = await req.json();
    if (body.lead_status) await updateLeadStatus(Number(id), body.lead_status as LeadStatus);
    if (body.notas !== undefined) await updateLeadNotes(Number(id), body.notas);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al actualizar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initDb();
    const { id } = await params;
    await deleteLead(Number(id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al eliminar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
