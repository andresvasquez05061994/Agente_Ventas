import { NextRequest, NextResponse } from "next/server";
import { dataOwnerId, requireAdmin, requireUser } from "@/lib/current-user";
import {
  deleteLead,
  ensureDb,
  updateCompanyEtapa,
  updateLeadNotes,
  updateLeadResultado,
  updateLeadStatus,
} from "@/lib/db";
import { isEtapaComercial, isGestionResultado, isLeadStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const { id } = await params;
    const leadId = Number(id);
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return NextResponse.json({ error: "ID de contacto no válido" }, { status: 400 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    let lead = null;

    // La etapa es de la empresa: actualiza todos sus contactos y devuelve la lista.
    if (body.etapa_comercial !== undefined) {
      if (!isEtapaComercial(body.etapa_comercial)) {
        return NextResponse.json({ error: "Etapa comercial no válida" }, { status: 400 });
      }
      const leads = await updateCompanyEtapa(leadId, body.etapa_comercial, dataOwnerId(actor));
      const opened = leads.find((item) => Number(item.id) === leadId) ?? leads[0];
      if (!opened) {
        return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, lead: opened, leads });
    }

    if (body.lead_status !== undefined && body.lead_status !== null) {
      if (!isLeadStatus(body.lead_status)) {
        return NextResponse.json({ error: "Estado de lead no válido" }, { status: 400 });
      }
      lead = await updateLeadStatus(leadId, body.lead_status, dataOwnerId(actor));
    }

    if (body.resultado_gestion !== undefined) {
      const raw = body.resultado_gestion;
      const resultado = raw === null || raw === "" ? null : raw;
      if (resultado !== null && !isGestionResultado(resultado)) {
        return NextResponse.json({ error: "Resultado de gestión no válido" }, { status: 400 });
      }
      lead = await updateLeadResultado(leadId, resultado, dataOwnerId(actor));
    }

    if (lead) return NextResponse.json({ ok: true, lead });

    if (body.notas !== undefined) {
      const lead = await updateLeadNotes(leadId, String(body.notas ?? ""), dataOwnerId(actor));
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
    const actor = await requireUser(_req);
    if (actor instanceof NextResponse) return actor;
    const denied = requireAdmin(actor);
    if (denied) return denied;
    const { id } = await params;
    const leadId = Number(id);
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return NextResponse.json({ error: "ID de contacto no válido" }, { status: 400 });
    }
    await deleteLead(leadId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al eliminar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
