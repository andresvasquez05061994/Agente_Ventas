import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { ensureDb } from "@/lib/db";
import { analyzePublicWebReference, listSellerWebSources } from "@/lib/seller-web-sources";
import { assertMistralRateLimit, UsageLimitError } from "@/lib/usage-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const sources = await listSellerWebSources(actor.id);
    return NextResponse.json({ sources });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron cargar las fuentes web";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    await assertMistralRateLimit(actor.id);
    const body = (await req.json().catch(() => ({}))) as { url?: unknown };
    const url = String(body.url ?? "").trim();
    if (!url) return NextResponse.json({ error: "Escribe la URL pública que quieres analizar." }, { status: 400 });
    const source = await analyzePublicWebReference(actor.id, url);
    return NextResponse.json({ source }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo analizar la URL";
    const status = error instanceof UsageLimitError ? error.status : /URL|página|dominio|dirección|redirig|texto comercial/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
