import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { persistPhoneWebhook } from "@/lib/apollo-enrich";

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const body = await req.json();
    const saved = await persistPhoneWebhook(body);
    return NextResponse.json({ ok: true, saved });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error en webhook Apollo";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
