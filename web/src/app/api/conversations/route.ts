import { NextRequest, NextResponse } from "next/server";
import { ensureDb, getConversationStats, getConversationThreads } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    await ensureDb();
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter") ?? "all";
    const search = searchParams.get("search") ?? undefined;

    const [threads, stats] = await Promise.all([
      getConversationThreads(filter, search),
      getConversationStats(),
    ]);

    return NextResponse.json({ threads, stats });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al cargar conversaciones";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
