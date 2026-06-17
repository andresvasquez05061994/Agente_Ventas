import { NextRequest, NextResponse } from "next/server";
import { searchApollo } from "@/lib/apollo";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = await searchApollo({
      pais: body.pais ?? "",
      cargo: body.cargo ?? "",
      keywords: body.keywords ?? "",
      page: body.page ?? 1,
      per_page: body.per_page ?? 25,
    });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error en búsqueda Apollo";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
