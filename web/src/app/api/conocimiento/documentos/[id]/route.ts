import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireUser } from "@/lib/current-user";
import { ensureDb } from "@/lib/db";
import {
  deleteKnowledgeDocument,
  setKnowledgeDocumentActive,
  updateKnowledgeDocumentMeta,
} from "@/lib/knowledge-store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const { id: raw } = await ctx.params;
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Documento no válido." }, { status: 400 });
    }
    const body = (await req.json()) as { active?: unknown; version?: unknown; valid_until?: unknown };
    const hasMeta = body.version !== undefined || body.valid_until !== undefined;

    if (hasMeta) {
      const document = await updateKnowledgeDocumentMeta(
        id,
        {
          version: body.version === undefined ? undefined : String(body.version ?? ""),
          valid_until:
            body.valid_until === undefined || body.valid_until === null ? null : String(body.valid_until),
        },
        actor.id
      );
      if (!document) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
      return NextResponse.json({ document });
    }

    if (typeof body.active !== "boolean") {
      return NextResponse.json({ error: "Indica si el documento queda activo." }, { status: 400 });
    }
    const document = await setKnowledgeDocumentActive(id, body.active, actor.id);
    if (!document) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
    return NextResponse.json({ document });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo actualizar el documento";
    return NextResponse.json({ error: msg }, { status: /vigencia/i.test(msg) ? 400 : 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    await ensureDb();
    const actor = await requireUser(_req);
    if (actor instanceof NextResponse) return actor;
    const denied = requireAdmin(actor);
    if (denied) return denied;
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
