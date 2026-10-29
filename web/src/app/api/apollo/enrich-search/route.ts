import { NextRequest, NextResponse } from "next/server";
import { ApolloApiError, searchApolloWithContacts } from "@/lib/apollo";
import { validateSearchRequest } from "@/lib/apollo-filters";
import { requireUser } from "@/lib/current-user";
import { ensureDb } from "@/lib/db";
import { assertApolloBudget, assertApolloEnrichmentRateLimit, UsageLimitError } from "@/lib/usage-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Ruta exclusiva del módulo Enriquecer: usa su ventana de carga masiva. */
export async function POST(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    await assertApolloEnrichmentRateLimit(actor.id);
    await assertApolloBudget(actor.id);
    const body = (await req.json()) as Record<string, unknown>;
    const input = validateSearchRequest(body);
    const requestedCount = Math.min(10, Math.max(1, Math.floor(Number(body.requested_count) || input.per_page)));
    return NextResponse.json(await searchApolloWithContacts(input, actor.id, requestedCount));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error en búsqueda Apollo";
    const status =
      error instanceof UsageLimitError || error instanceof ApolloApiError
        ? error.status
        : message.includes("no válid")
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
