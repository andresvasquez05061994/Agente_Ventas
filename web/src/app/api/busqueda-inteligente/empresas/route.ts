import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { ensureDb } from "@/lib/db";
import { findOfficialCompanyMatches } from "@/lib/official-company-data";
import { getActiveSellerSolutionsByIds } from "@/lib/seller-solutions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const { searchParams } = new URL(req.url);
    const ids = searchParams
      .getAll("solution_id")
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);
    if (!ids.length) {
      return NextResponse.json({ error: "Selecciona al menos una solución activa." }, { status: 400 });
    }
    const solutions = await getActiveSellerSolutionsByIds(actor.id, ids);
    if (!solutions.length) {
      return NextResponse.json({ error: "Las soluciones seleccionadas no están activas en tu perfil." }, { status: 400 });
    }
    const matches = await findOfficialCompanyMatches(actor.id, solutions);
    return NextResponse.json({
      matches,
      selected_solutions: solutions.map((solution) => ({ id: solution.id, name: solution.name })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo buscar empresas compatibles";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
