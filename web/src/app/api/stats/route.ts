import { NextResponse } from "next/server";
import { ensureDb, getStats } from "@/lib/db";
import { getApolloBudgetSnapshot } from "@/lib/usage-guard";

export async function GET() {
  try {
    await ensureDb();
    const [stats, apollo] = await Promise.all([
      getStats(),
      getApolloBudgetSnapshot(),
    ]);
    return NextResponse.json({ ...stats, apollo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de estadísticas";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
