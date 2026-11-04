import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { ensureDb } from "@/lib/db";
import {
  deleteCompanySource,
  listCompanySources,
  MAX_COMPANY_SOURCE_BYTES,
  normalizeDeclaredSource,
  parseCompanySourceFile,
  saveCompanySource,
} from "@/lib/official-company-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const sources = await listCompanySources(actor.id);
    return NextResponse.json({ sources });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron cargar las bases de empresas";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Adjunta un Excel o CSV de empresas." }, { status: 400 });
    }
    if (file.size > MAX_COMPANY_SOURCE_BYTES) {
      return NextResponse.json({ error: "El archivo supera 4 MB." }, { status: 400 });
    }
    const records = await parseCompanySourceFile(file.name, new Uint8Array(await file.arrayBuffer()));
    const source = await saveCompanySource({
      ownerId: actor.id,
      filename: file.name,
      declaredSource: normalizeDeclaredSource(form.get("declared_source")),
      records,
    });
    return NextResponse.json({ source, imported: records.length }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo importar la base de empresas";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "ID de fuente no válido" }, { status: 400 });
    }
    const deleted = await deleteCompanySource(actor.id, id);
    if (!deleted) return NextResponse.json({ error: "Fuente no encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo eliminar la base";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
