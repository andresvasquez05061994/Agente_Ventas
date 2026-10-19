import { NextRequest, NextResponse } from "next/server";
import { dataOwnerId, requireUser } from "@/lib/current-user";
import { ensureDb, getLeads, saveLeads } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const { searchParams } = new URL(req.url);
    const all = searchParams.get("all") === "true";
    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const perPage = Math.max(1, Number(searchParams.get("per_page") ?? 20) || 20);

    const result = await getLeads(
      {
        status: searchParams.get("status") ?? undefined,
        resultado: searchParams.get("resultado") ?? undefined,
        search: searchParams.get("search") ?? undefined,
        contact: searchParams.get("contact") ?? undefined,
      },
      { page, perPage, all },
      dataOwnerId(actor)
    );

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al obtener leads";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const body = await req.json();
    const leads = (body.leads ?? []) as Array<{
      apollo_id: string;
      nombre: string;
      cargo?: string | null;
      empresa?: string | null;
      email?: string | null;
      telefono?: string | null;
      pais?: string | null;
      linkedin_url?: string | null;
    }>;

    const invalid = leads.filter((l) => !l.email?.trim() || !l.telefono?.trim());
    if (invalid.length) {
      return NextResponse.json(
        { error: "Solo se pueden guardar contactos con email y teléfono." },
        { status: 400 }
      );
    }

    const normalized = leads.map((l) => ({
      apollo_id: l.apollo_id,
      nombre: l.nombre,
      cargo: l.cargo ?? null,
      empresa: l.empresa ?? null,
      email: l.email!.trim(),
      telefono: l.telefono!.trim(),
      pais: l.pais ?? null,
      linkedin_url: l.linkedin_url ?? null,
    }));

    const result = await saveLeads(normalized, body.fuente ?? "Apollo", actor.id);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al guardar leads";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

