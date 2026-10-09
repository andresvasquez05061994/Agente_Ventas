import { NextRequest, NextResponse } from "next/server";
import { hasSession, isAuthRequired, unauthorizedJson, WIPE_CONFIRM_PHRASE } from "@/lib/auth";
import { clearAllLeads, ensureDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (isAuthRequired() && !hasSession(req)) return unauthorizedJson();

  try {
    const body = (await req.json()) as { confirm?: string };
    if (String(body.confirm ?? "") !== WIPE_CONFIRM_PHRASE) {
      return NextResponse.json(
        { error: `Escribe exactamente «${WIPE_CONFIRM_PHRASE}» para confirmar.` },
        { status: 400 }
      );
    }
    await ensureDb();
    const deleted = await clearAllLeads();
    return NextResponse.json({ deleted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al vaciar portafolio";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
