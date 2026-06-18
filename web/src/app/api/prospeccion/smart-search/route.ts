import { NextRequest, NextResponse } from "next/server";
import {
  SmartSearchError,
  interpretSmartSearch,
  verifyMistralHealth,
} from "@/lib/smart-search";

export async function GET() {
  try {
    const health = await verifyMistralHealth();
    return NextResponse.json(health, { status: health.ok ? 200 : 503 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al verificar Mistral";
    return NextResponse.json({ configured: false, ok: false, message: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = String(body.query ?? "").trim();
    const result = await interpretSmartSearch(query);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo interpretar la búsqueda";
    const status =
      e instanceof SmartSearchError && e.status
        ? e.status
        : e instanceof SmartSearchError
          ? 400
          : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
