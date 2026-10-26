import { NextRequest, NextResponse } from "next/server";
import {
  generateOutreachMessage,
  isOutreachChannel,
  OutreachError,
  outreachHeadline,
  type OutreachChannel,
} from "@/lib/commercial-outreach";
import { dataOwnerId, requireUser } from "@/lib/current-user";
import { ensureDb, getLeadById, insertGeneratedMessage } from "@/lib/db";
import { assertMistralRateLimit, UsageLimitError } from "@/lib/usage-guard";

export const maxDuration = 60;

function str(value: unknown): string | null {
  return value != null && value !== "" ? String(value) : null;
}

/**
 * Genera un mensaje (llamada, correo o WhatsApp) y lo guarda para trazabilidad.
 * Nada se envía desde aquí: el vendedor copia el texto y decide.
 */
export async function POST(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const body = (await req.json()) as Record<string, unknown>;
    const channel: OutreachChannel = isOutreachChannel(body.channel) ? body.channel : "call";

    // Si el contacto está en el portafolio, la etapa y el historial salen de la base,
    // no de lo que mande el cliente; además se valida que pertenezca al vendedor.
    const leadIdRaw = Number(body.lead_id);
    const leadId = Number.isFinite(leadIdRaw) && leadIdRaw > 0 ? leadIdRaw : null;
    const lead = leadId ? await getLeadById(leadId, dataOwnerId(actor)) : null;
    if (leadId && !lead) {
      return NextResponse.json({ error: "Contacto no encontrado en tu portafolio" }, { status: 404 });
    }

    await assertMistralRateLimit(actor.id);
    const result = await generateOutreachMessage(
      {
        nombre: String(lead?.nombre ?? body.nombre ?? ""),
        cargo: lead ? lead.cargo : str(body.cargo),
        empresa: lead ? lead.empresa : str(body.empresa),
        pais: lead ? lead.pais : str(body.pais),
        email: lead ? lead.email : str(body.email),
        notas: lead ? lead.notas : str(body.notas),
        fuente: lead ? lead.fuente_busqueda : str(body.fuente),
        linkedin_url: lead ? lead.linkedin_url : str(body.linkedin_url),
        lead_id: lead ? Number(lead.id) : null,
        lead_status: lead?.lead_status ?? null,
        resultado_gestion: lead?.resultado_gestion ?? null,
        etapa_comercial: lead?.etapa_comercial ?? null,
        created_at: lead?.created_at ?? null,
      },
      channel,
      actor.id
    );

    let message_id: number | null = null;
    let trace_warning: string | null = null;
    if (!lead) {
      trace_warning = "El contacto no está en el portafolio, así que este mensaje no queda en el historial.";
    } else {
      try {
        const saved = await insertGeneratedMessage({
          leadId: Number(lead.id),
          ownerId: actor.id,
          channel,
          headline: outreachHeadline(result),
          content: result,
          leadStatus: lead.lead_status ?? null,
          resultadoGestion: lead.resultado_gestion ?? null,
          etapaComercial: lead.etapa_comercial ?? null,
          source: result.source,
          model: result.model ?? null,
        });
        message_id = saved.id;
      } catch {
        trace_warning = "El mensaje se generó, pero no se pudo guardar en el historial del contacto.";
      }
    }

    return NextResponse.json({ ...result, message_id, trace_warning });
  } catch (e) {
    const message =
      e instanceof UsageLimitError || e instanceof OutreachError
        ? e.message
        : "Error al generar mensaje comercial";
    const status =
      e instanceof UsageLimitError
        ? e.status
        : e instanceof OutreachError && e.status
          ? e.status
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
