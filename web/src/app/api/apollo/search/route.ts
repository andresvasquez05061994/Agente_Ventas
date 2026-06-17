import { NextRequest, NextResponse } from "next/server";
import { ApolloApiError, searchApollo } from "@/lib/apollo";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const person_locations: string[] =
      body.person_locations ??
      (body.pais ? [body.pais] : []);

    const person_titles: string[] =
      body.person_titles ??
      (body.cargo
        ? String(body.cargo)
            .split(",")
            .map((t: string) => t.trim())
            .filter(Boolean)
        : []);

    const person_seniorities: string[] =
      body.person_seniorities ??
      (body.seniority ? [body.seniority] : []);

    const q_keywords: string =
      body.q_keywords ?? body.keywords ?? "";

    const data = await searchApollo({
      person_locations,
      person_titles,
      person_seniorities: person_seniorities.filter(Boolean),
      q_keywords,
      page: body.page ?? 1,
      per_page: body.per_page ?? 25,
    });

    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error en búsqueda Apollo";
    const status = e instanceof ApolloApiError ? e.status : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
