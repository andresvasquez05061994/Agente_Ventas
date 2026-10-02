import { NextResponse } from "next/server";
import { getApolloProspeccionCredits, ensureDb, getStats } from "@/lib/db";
import { requireTeamApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireTeamApi();
  if (denied) return denied;
  try {
    await ensureDb();
    const [stats, apollo] = await Promise.all([
      getStats(),
      getApolloProspeccionCredits(),
    ]);
    return NextResponse.json({ ...stats, apollo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de estadísticas";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
