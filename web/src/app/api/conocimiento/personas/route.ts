import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import {
  countBuyerPersonas,
  insertBuyerPersona,
  MAX_BUYER_PERSONAS,
} from "@/lib/knowledge-store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await ensureDb();
    const total = await countBuyerPersonas();
    if (total >= MAX_BUYER_PERSONAS) {
      return NextResponse.json(
        { error: `Máximo ${MAX_BUYER_PERSONAS} buyer personas.` },
        { status: 400 }
      );
    }
    const body = (await req.json()) as Record<string, unknown>;
    const persona = await insertBuyerPersona({
      name: String(body.name ?? ""),
      role: String(body.role ?? ""),
      sector: String(body.sector ?? ""),
      characteristics: String(body.characteristics ?? ""),
      value_for_client: String(body.value_for_client ?? ""),
      active: body.active !== false,
    });
    return NextResponse.json({ persona });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo crear el buyer persona";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
