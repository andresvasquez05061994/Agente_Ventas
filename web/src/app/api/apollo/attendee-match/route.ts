import { NextRequest, NextResponse } from "next/server";
import { matchAttendeeContact, parseMatchCountries, ApolloApiError } from "@/lib/apollo-attendee-match";
import { cleanPersonName } from "@/lib/excel-attendees";
import { cleanCompanyName } from "@/lib/excel-companies";
import { requireUser } from "@/lib/current-user";
import { ensureDb } from "@/lib/db";
import { assertApolloBudget, assertApolloRateLimit, UsageLimitError } from "@/lib/usage-guard";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    assertApolloRateLimit();
    await assertApolloBudget(actor.id);
    const body = (await req.json()) as Record<string, unknown>;

    const name = cleanPersonName(String(body.name ?? ""));
    const company = cleanCompanyName(String(body.company ?? ""));
    if (!name) {
      return NextResponse.json(
        { error: "Para no traer personas ajenas al archivo, cada fila debe tener nombre." },
        { status: 400 }
      );
    }

    const parsed = parseMatchCountries(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const title = String(body.title ?? "").trim().slice(0, 80);
    const result = await matchAttendeeContact(
      {
        name,
        title: title || undefined,
        company: company || undefined,
        countries: parsed.countries,
      },
      actor.id
    );
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error buscando al contacto";
    const status = e instanceof UsageLimitError || e instanceof ApolloApiError ? e.status : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
