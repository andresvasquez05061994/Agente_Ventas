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
    const result = await saveLeads(body.leads, body.fuente ?? "Apollo");
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al guardar leads";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
