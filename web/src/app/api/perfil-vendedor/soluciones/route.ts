import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { ensureDb } from "@/lib/db";
import {
  createSellerSolution,
  listSellerSolutions,
  type SellerSolutionInput,
} from "@/lib/seller-solutions";
import {
  documentSourceLabel,
  listActiveKnowledgeDocuments,
} from "@/lib/knowledge-store";
import { listActiveSellerWebSources } from "@/lib/seller-web-sources";

export const dynamic = "force-dynamic";

async function sourceSuggestions(ownerId: number) {
  const [documents, webSources] = await Promise.all([
    listActiveKnowledgeDocuments(ownerId),
    listActiveSellerWebSources(ownerId),
  ]);

  return [
    ...documents.flatMap((document) => {
      const services = document.structured?.services ?? [];
      if (!services.length) return [];
      return [{
        source: documentSourceLabel(document),
        source_type: "archivo" as const,
        services,
      }];
    }),
    ...webSources.flatMap((source) => {
      const services = source.structured?.services ?? [];
      if (!services.length) return [];
      return [{
        source: source.label || source.source_url,
        source_type: "web" as const,
        source_url: source.source_url,
        services,
      }];
    }),
  ];
}

export async function GET(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const [solutions, suggestions] = await Promise.all([
      listSellerSolutions(actor.id),
      sourceSuggestions(actor.id),
    ]);
    return NextResponse.json({ solutions, suggestions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron cargar las soluciones";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const body = (await req.json().catch(() => ({}))) as Partial<SellerSolutionInput>;
    const solution = await createSellerSolution(actor.id, body);
    return NextResponse.json({ solution }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar el producto o servicio";
    return NextResponse.json({ error: message }, { status: /máximo|Escribe/i.test(message) ? 400 : 500 });
  }
}
