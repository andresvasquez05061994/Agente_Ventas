import { NextRequest, NextResponse } from "next/server";
import { ApolloApiError } from "@/lib/apollo";
import { searchCompanyContacts } from "@/lib/apollo-company-contacts";
import {
  APOLLO_COUNTRIES,
  APOLLO_PER_PAGE_OPTIONS,
  APOLLO_SENIORITIES,
  normalizeJobTitles,
} from "@/lib/apollo-filters";
import { cleanCompanyName, parseCompanyCell } from "@/lib/excel-companies";
import { ensureDb } from "@/lib/db";

export const maxDuration = 60;

const COUNTRIES = new Set<string>(APOLLO_COUNTRIES.map((c) => c.value));
const SENIORITIES = new Set<string>(APOLLO_SENIORITIES.map((s) => s.value));

export async function POST(req: NextRequest) {
  try {
    await ensureDb();
    const body = (await req.json()) as Record<string, unknown>;

    const company = cleanCompanyName(String(body.company ?? ""));
    if (!company) {
      return NextResponse.json({ error: "Nombre de empresa no válido." }, { status: 400 });
    }

    const country = String(body.country ?? "");
    if (!COUNTRIES.has(country)) {
      return NextResponse.json({ error: "País no válido." }, { status: 400 });
    }

    const allRoles = body.all_roles === true;
    const titles = normalizeJobTitles(Array.isArray(body.titles) ? body.titles.map(String) : []);
    if (!allRoles && !titles.length) {
      return NextResponse.json({ error: "Selecciona al menos un cargo." }, { status: 400 });
    }

    const seniority = String(body.seniority ?? "");
    if (seniority && !SENIORITIES.has(seniority)) {
      return NextResponse.json({ error: "Seniority no válido." }, { status: 400 });
    }

    const perCompany = Number(body.per_company ?? 5);
    if (!APOLLO_PER_PAGE_OPTIONS.includes(perCompany as (typeof APOLLO_PER_PAGE_OPTIONS)[number])) {
      return NextResponse.json({ error: "Cantidad de contactos no válida." }, { status: 400 });
    }

    const orgIds = Array.isArray(body.organization_ids)
      ? body.organization_ids.map((id) => String(id).trim()).filter(Boolean)
      : [];
    const orgName = typeof body.organization_name === "string" ? body.organization_name.trim() : "";

    // Sigla: la que detectó el cliente o, si no vino, la que se pueda extraer de la celda.
    const detectedAlias = parseCompanyCell(String(body.company ?? "")).alias;
    const aliasSource = typeof body.alias === "string" && body.alias.trim() ? body.alias : detectedAlias ?? "";
    const alias = aliasSource ? cleanCompanyName(aliasSource) || null : null;

    const result = await searchCompanyContacts({
      company,
      alias,
      country,
      titles,
      allRoles,
      seniority,
      perCompany,
      organization:
        orgIds.length && orgName
          ? { id: orgIds[0], ids: orgIds, name: orgName, domain: null, score: 100 }
          : null,
      dryRun: body.dry_run === true,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error buscando contactos de la empresa";
    const status = e instanceof ApolloApiError ? e.status : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
