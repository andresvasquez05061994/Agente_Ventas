import { NextResponse } from "next/server";
import { getApolloProspeccionCredits, getStats, initDb } from "@/lib/db";

export async function GET() {
  try {
    await initDb();
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
