import { NextResponse } from "next/server";
import { getStats, initDb } from "@/lib/db";

export async function GET() {
  try {
    await initDb();
    const stats = await getStats();
    return NextResponse.json(stats);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de estadísticas";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
