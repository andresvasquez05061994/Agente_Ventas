import { NextRequest, NextResponse } from "next/server";
import { ApolloApiError, searchApolloWithContacts } from "@/lib/apollo";
import { validateSearchRequest } from "@/lib/apollo-filters";
import { requireUser } from "@/lib/current-user";
import { ensureDb } from "@/lib/db";
import { assertApolloBudget, assertApolloRateLimit, UsageLimitError } from "@/lib/usage-guard";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    assertApolloRateLimit();
    await assertApolloBudget(actor.id);
    const body = await req.json();
    const input = validateSearchRequest(body);
    const data = await searchApolloWithContacts(input, actor.id);
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error en búsqueda Apollo";
    const status =
      e instanceof UsageLimitError || e instanceof ApolloApiError
        ? e.status
        : e instanceof Error && msg.includes("no válid")
          ? 400
          : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
