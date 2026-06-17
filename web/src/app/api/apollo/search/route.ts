import { NextRequest, NextResponse } from "next/server";
import { ApolloApiError, searchApolloWithContacts } from "@/lib/apollo";
import { validateSearchRequest } from "@/lib/apollo-filters";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = validateSearchRequest(body);
    const data = await searchApolloWithContacts(input);
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error en búsqueda Apollo";
    const status = e instanceof ApolloApiError ? e.status : e instanceof Error && msg.includes("no válid") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
