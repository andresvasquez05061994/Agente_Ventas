import { NextRequest, NextResponse } from "next/server";
import { dataOwnerId, requireUser } from "@/lib/current-user";
import { ensureDb, getCompanyFicha } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;

    const leadId = Number(new URL(req.url).searchParams.get("id"));
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return NextResponse.json({ error: "ID de contacto no válido" }, { status: 400 });
    }

    const ficha = await getCompanyFicha(leadId, dataOwnerId(actor), actor.id);
    if (!ficha) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      contacts: ficha.contacts,
      colleagues: actor.role === "admin" ? [] : ficha.colleagues,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al abrir la ficha";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
