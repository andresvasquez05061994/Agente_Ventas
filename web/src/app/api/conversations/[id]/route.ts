import { NextRequest, NextResponse } from "next/server";
import { ensureDb, getLeadById, getMessagesForLead } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDb();
    const { id } = await params;
    const leadId = Number(id);
    if (!Number.isFinite(leadId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const [lead, messages] = await Promise.all([
      getLeadById(leadId),
      getMessagesForLead(leadId),
    ]);

    if (!lead) {
      return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ lead, messages });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al cargar mensajes";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
