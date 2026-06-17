import { NextRequest, NextResponse } from "next/server";
import { getLeads, initDb, saveLeads } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    await initDb();
    const { searchParams } = new URL(req.url);
    const leads = await getLeads({
      status: searchParams.get("status") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      contact: searchParams.get("contact") ?? undefined,
    });
    return NextResponse.json({ leads });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al obtener leads";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const body = await req.json();
    const leads = (body.leads ?? []) as Array<{
      apollo_id: string;
      nombre: string;
      email?: string | null;
      telefono?: string | null;
    }>;

    const invalid = leads.filter((l) => !l.email?.trim() || !l.telefono?.trim());
    if (invalid.length) {
      return NextResponse.json(
        { error: "Solo se pueden guardar contactos con email y teléfono." },
        { status: 400 }
      );
    }

    const normalized = leads.map((l) => ({
      ...l,
      email: l.email!.trim(),
      telefono: l.telefono!.trim(),
    }));

    const result = await saveLeads(normalized, body.fuente ?? "Apollo");
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al guardar leads";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
