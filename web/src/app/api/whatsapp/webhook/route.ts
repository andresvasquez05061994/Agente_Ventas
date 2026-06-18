import { NextRequest, NextResponse } from "next/server";
import {
  ensureDb,
  getLeadByPhone,
  saveWhatsAppMessage,
  updateLeadConversationId,
  updateLeadWhatsAppStatus,
} from "@/lib/db";

/**
 * Webhook entrante de WhatsApp (Meta / Twilio / pruebas).
 * Body: { telefono: string, mensaje: string, conversation_id?: string }
 */
export async function POST(req: NextRequest) {
  try {
    await ensureDb();
    const body = await req.json();
    const telefono = String(body.telefono ?? "").trim();
    const mensaje = String(body.mensaje ?? body.message ?? "").trim();

    if (!telefono || !mensaje) {
      return NextResponse.json(
        { error: "telefono y mensaje son requeridos" },
        { status: 400 }
      );
    }

    const lead = await getLeadByPhone(telefono);
    if (!lead) {
      return NextResponse.json(
        { error: "Número no asociado a ningún lead del portafolio" },
        { status: 404 }
      );
    }

    await saveWhatsAppMessage(lead.id, telefono, "inbound", mensaje);
    await updateLeadWhatsAppStatus(lead.id, "En conversación");

    if (body.conversation_id) {
      await updateLeadConversationId(lead.id, String(body.conversation_id));
    }

    // La respuesta del agente Mistral se integrará en el worker de Fase 3.
    return NextResponse.json({
      ok: true,
      lead_id: lead.id,
      received: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error en webhook WhatsApp";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
