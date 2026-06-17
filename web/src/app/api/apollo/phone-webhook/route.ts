import { NextRequest, NextResponse } from "next/server";
import { initDb, recordProspeccionCredits } from "@/lib/db";
import { persistPhoneWebhook } from "@/lib/apollo-enrich";

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const body = await req.json();
    const result = await persistPhoneWebhook(body);
    if (result.credits_consumed > 0) {
      await recordProspeccionCredits(
        result.credits_consumed,
        result.phones_saved,
        "phone_webhook"
      );
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error en webhook Apollo";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
