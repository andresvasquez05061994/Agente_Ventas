import { NextRequest, NextResponse } from "next/server";
import { ensureDb, recordProspeccionCredits } from "@/lib/db";
import { persistPhoneWebhook } from "@/lib/apollo-enrich";
import { verifySharedToken } from "@/lib/webhook-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!verifySharedToken(token, process.env.APOLLO_WEBHOOK_SECRET?.trim() ?? "")) {
    return NextResponse.json({ error: "Webhook no autorizado" }, { status: 401 });
  }
  try {
    await ensureDb();
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
