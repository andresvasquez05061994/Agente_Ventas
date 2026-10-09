import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { deleteKnowledgeDocument, setKnowledgeDocumentActive } from "@/lib/knowledge-store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await ensureDb();
    const { id: raw } = await ctx.params;
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Documento no válido." }, { status: 400 });
    }
    const body = (await req.json()) as { active?: unknown };
    if (typeof body.active !== "boolean") {
      return NextResponse.json({ error: "Indica si el documento queda activo." }, { status: 400 });
    }
    const document = await setKnowledgeDocumentActive(id, body.active);
    if (!document) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
    return NextResponse.json({ document });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo actualizar el documento";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    await ensureDb();
    const { id: raw } = await ctx.params;
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Documento no válido." }, { status: 400 });
    }
    const ok = await deleteKnowledgeDocument(id);
    if (!ok) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo eliminar el documento";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
