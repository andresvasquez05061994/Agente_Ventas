import { NextRequest, NextResponse } from "next/server";
import { deleteLead, ensureDb, updateLeadNotes, updateLeadStatus } from "@/lib/db";
import { isLeadStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDb();
    const { id } = await params;
    const leadId = Number(id);
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return NextResponse.json({ error: "ID de contacto no válido" }, { status: 400 });
    }

    const body = (await req.json()) as Record<string, unknown>;

    if (body.lead_status !== undefined && body.lead_status !== null) {
      if (!isLeadStatus(body.lead_status)) {
        return NextResponse.json({ error: "Estado de lead no válido" }, { status: 400 });
      }
      const lead = await updateLeadStatus(leadId, body.lead_status);
      return NextResponse.json({ ok: true, lead });
    }

    if (body.notas !== undefined) {
      const lead = await updateLeadNotes(leadId, String(body.notas ?? ""));
      return NextResponse.json({ ok: true, lead });
    }

    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al actualizar";
    const status = msg.includes("no encontrado") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDb();
    const { id } = await params;
    await deleteLead(Number(id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al eliminar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
