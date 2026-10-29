import { NextRequest, NextResponse } from "next/server";
import { dataOwnerId, requireUser } from "@/lib/current-user";
import { ensureDb, listPortfolioContacts } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Contactos del dueño actual para resolver filas antes de consultar Apollo. */
export async function GET(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const contacts = await listPortfolioContacts(dataOwnerId(actor));
    return NextResponse.json({ contacts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo consultar el portafolio.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
