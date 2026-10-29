import { NextRequest, NextResponse } from "next/server";
import { ApolloApiError } from "@/lib/apollo";
import { searchCompanyContacts } from "@/lib/apollo-company-contacts";
import { APOLLO_COUNTRIES, APOLLO_PER_PAGE_OPTIONS, normalizeJobTitles } from "@/lib/apollo-filters";
import { cleanCompanyName, parseCompanyCell } from "@/lib/excel-companies";
import { requireUser } from "@/lib/current-user";
import { ensureDb } from "@/lib/db";
import { assertApolloBudget, assertApolloEnrichmentRateLimit, UsageLimitError } from "@/lib/usage-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COUNTRIES = new Set<string>(APOLLO_COUNTRIES.map((country) => country.value));

/** Búsqueda de una empresa del archivo, con la ventana propia de enriquecimiento masivo. */
export async function POST(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    await assertApolloEnrichmentRateLimit(actor.id);
    await assertApolloBudget(actor.id);
    const body = (await req.json()) as Record<string, unknown>;
    const company = cleanCompanyName(String(body.company ?? ""));
    if (!company) return NextResponse.json({ error: "Nombre de empresa no válido." }, { status: 400 });

    const country = String(body.country ?? "").trim();
    if (country && !COUNTRIES.has(country)) return NextResponse.json({ error: "País no válido." }, { status: 400 });
    const titles = normalizeJobTitles(Array.isArray(body.titles) ? body.titles.map(String) : []);
    const allRoles = body.all_roles === true || !titles.length;
    const perCompany = Number(body.per_company ?? 5);
    if (!APOLLO_PER_PAGE_OPTIONS.includes(perCompany as (typeof APOLLO_PER_PAGE_OPTIONS)[number])) {
      return NextResponse.json({ error: "Cantidad de contactos no válida." }, { status: 400 });
    }

    const alias = parseCompanyCell(String(body.company ?? "")).alias;
    const requestedCount = Math.min(10, Math.max(1, Math.floor(Number(body.requested_count) || perCompany)));
    const result = await searchCompanyContacts(
      {
        company,
        alias: alias ? cleanCompanyName(alias) || null : null,
        country,
        titles,
        allRoles,
        seniority: "",
        perCompany,
        targetComplete: requestedCount,
      },
      actor.id
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error buscando contactos de la empresa";
    const status = error instanceof UsageLimitError || error instanceof ApolloApiError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
