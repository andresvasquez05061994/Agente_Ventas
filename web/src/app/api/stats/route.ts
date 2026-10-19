import { NextRequest, NextResponse } from "next/server";
import { dataOwnerId, requireUser } from "@/lib/current-user";
import { ensureDb, getStats } from "@/lib/db";
import { getApolloBudgetSnapshot } from "@/lib/usage-guard";

export async function GET(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const [stats, apollo] = await Promise.all([
      getStats(dataOwnerId(actor)),
      getApolloBudgetSnapshot(actor.id),
    ]);
    return NextResponse.json({ ...stats, apollo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de estadísticas";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
