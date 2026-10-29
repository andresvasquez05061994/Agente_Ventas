import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { ensureDb, getOrCreateEnrichmentSession } from "@/lib/db";

export const dynamic = "force-dynamic";

const FINGERPRINT = /^[a-f0-9]{64}$/i;

function stringList(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== "string")) return null;
  return value.map((item) => item.slice(0, 500));
}

function columns(value: unknown): unknown[] | null {
  if (!Array.isArray(value) || value.length > 250) return null;
  return value;
}

export async function POST(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const body = (await req.json()) as Record<string, unknown>;
    const fingerprint = String(body.fingerprint ?? "").trim();
    const filename = String(body.filename ?? "").trim().slice(0, 240);
    const headers = stringList(body.headers, 250);
    const parsedColumns = columns(body.columns);
    const sourceRows = Math.floor(Number(body.sourceRows));
    if (!FINGERPRINT.test(fingerprint) || !filename || !headers || !parsedColumns || sourceRows < 1 || sourceRows > 8000) {
      return NextResponse.json({ error: "La sesión de enriquecimiento no tiene un archivo válido." }, { status: 400 });
    }
    const result = await getOrCreateEnrichmentSession({
      ownerId: actor.id,
      fingerprint: fingerprint.toLowerCase(),
      filename,
      headers,
      columns: parsedColumns,
      sourceRows,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo preparar la sesión de enriquecimiento.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
