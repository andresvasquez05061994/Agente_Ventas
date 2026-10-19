import { NextRequest, NextResponse } from "next/server";
import { ensureDb, latestOwnerForApollo, recordProspeccionCredits } from "@/lib/db";
import { getAdminUser } from "@/lib/users";
import { persistPhoneWebhook } from "@/lib/apollo-enrich";
import { requestProvidesWebhookToken, unauthorizedJson } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!requestProvidesWebhookToken(req, "apollo")) return unauthorizedJson();

  try {
    await ensureDb();
    const body = await req.json();
    const result = await persistPhoneWebhook(body);
    if (result.credits_consumed > 0) {
      let ownerId = result.apollo_ids[0] ? await latestOwnerForApollo(result.apollo_ids[0]) : null;
      if (!ownerId) ownerId = (await getAdminUser())?.id ?? null;
      await recordProspeccionCredits(
        result.credits_consumed,
        result.phones_saved,
        "phone_webhook",
        ownerId
      );
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error en webhook Apollo";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
