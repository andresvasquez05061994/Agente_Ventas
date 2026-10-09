import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { deleteBuyerPersona, updateBuyerPersona } from "@/lib/knowledge-store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    await ensureDb();
    const id = parseId((await ctx.params).id);
    if (!id) return NextResponse.json({ error: "Buyer persona no válido." }, { status: 400 });
    const body = (await req.json()) as Record<string, unknown>;
    const persona = await updateBuyerPersona(id, {
      name: String(body.name ?? ""),
      role: String(body.role ?? ""),
      sector: String(body.sector ?? ""),
      characteristics: String(body.characteristics ?? ""),
      value_for_client: String(body.value_for_client ?? ""),
      active: body.active !== false,
    });
    if (!persona) return NextResponse.json({ error: "Buyer persona no encontrado." }, { status: 404 });
    return NextResponse.json({ persona });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo guardar el buyer persona";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    await ensureDb();
    const id = parseId((await ctx.params).id);
    if (!id) return NextResponse.json({ error: "Buyer persona no válido." }, { status: 400 });
    const ok = await deleteBuyerPersona(id);
    if (!ok) return NextResponse.json({ error: "Buyer persona no encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo eliminar el buyer persona";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
