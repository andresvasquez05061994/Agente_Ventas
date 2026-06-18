import { NextRequest, NextResponse } from "next/server";
import { ApolloApiError } from "@/lib/apollo";
import {
  mergeCompanySuggestions,
  searchApolloOrganizations,
} from "@/lib/apollo-organizations";
import { APOLLO_COUNTRIES } from "@/lib/apollo-filters";
import { ensureDb, searchDistinctCompanies } from "@/lib/db";

const COUNTRY_VALUES = new Set(APOLLO_COUNTRIES.map((c) => c.value));

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const country = req.nextUrl.searchParams.get("country")?.trim() ?? "";

    if (q.length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    if (country && !COUNTRY_VALUES.has(country as (typeof APOLLO_COUNTRIES)[number]["value"])) {
      return NextResponse.json({ error: "País no válido." }, { status: 400 });
    }

    await ensureDb();
    const portfolio = await searchDistinctCompanies(q, 6);

    let apollo: Awaited<ReturnType<typeof searchApolloOrganizations>> = [];
    try {
      apollo = await searchApolloOrganizations(q, country || undefined);
    } catch (e) {
      if (portfolio.length === 0) throw e;
    }

    const suggestions = mergeCompanySuggestions(apollo, portfolio, q, 8);
    return NextResponse.json({ suggestions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al buscar empresas";
    const status = e instanceof ApolloApiError ? e.status : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
