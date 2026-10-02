import { NextRequest, NextResponse } from "next/server";
import {
  ensureDb,
  getLeadByPhone,
  saveWhatsAppMessage,
  updateLeadConversationId,
  updateLeadWhatsAppStatus,
} from "@/lib/db";
import { verifyMetaSignature, verifySubscribeHandshake } from "@/lib/webhook-auth";

export const dynamic = "force-dynamic";

/**
 * Verificación del webhook (Meta): hub.mode, hub.verify_token, hub.challenge.
 * El challenge se devuelve en texto plano, sin JSON.
 */
export async function GET(req: NextRequest) {
  const challenge = verifySubscribeHandshake(
    req.nextUrl.searchParams.get("hub.mode"),
    req.nextUrl.searchParams.get("hub.verify_token"),
    req.nextUrl.searchParams.get("hub.challenge"),
    process.env.WHATSAPP_VERIFY_TOKEN?.trim() ?? ""
  );
  if (!challenge) {
    return NextResponse.json({ error: "Verificación rechazada" }, { status: 403 });
  }
  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Mensaje entrante. Solo se procesa si `X-Hub-Signature-256` coincide con
 * el HMAC-SHA256 del cuerpo crudo y `WHATSAPP_APP_SECRET`.
 * Body aceptado tras la firma: { telefono, mensaje | message, conversation_id? }.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const valid = verifyMetaSignature(
    raw,
    req.headers.get("x-hub-signature-256"),
    process.env.WHATSAPP_APP_SECRET?.trim() ?? ""
  );
  if (!valid) {
    return NextResponse.json({ error: "Firma de WhatsApp inválida" }, { status: 401 });
  }

  let body: {
    telefono?: unknown;
    mensaje?: unknown;
    message?: unknown;
    conversation_id?: unknown;
  };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    await ensureDb();
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
