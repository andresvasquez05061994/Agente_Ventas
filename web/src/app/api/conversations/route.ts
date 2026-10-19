import { NextRequest, NextResponse } from "next/server";
import { dataOwnerId, requireUser } from "@/lib/current-user";
import { ensureDb, getConversationStats, getConversationThreads } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter") ?? "all";
    const search = searchParams.get("search") ?? undefined;
    const ownerId = dataOwnerId(actor);

    const [threads, stats] = await Promise.all([
      getConversationThreads(filter, search, ownerId),
      getConversationStats(ownerId),
    ]);

    return NextResponse.json({ threads, stats });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al cargar conversaciones";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
