import { NextRequest, NextResponse } from "next/server";
import {
  SmartSearchError,
  interpretSmartSearch,
  verifyMistralHealth,
} from "@/lib/smart-search";
import { requireUser } from "@/lib/current-user";
import { ensureDb } from "@/lib/db";
import { assertMistralRateLimit, UsageLimitError } from "@/lib/usage-guard";
import { getActiveSellerSolutionsByIds } from "@/lib/seller-solutions";

const SMART_ELIGIBLE_EMPLOYEE_RANGES = new Set([
  "51,200",
  "101,10000",
  "201,10000",
  "5001,10000",
]);

export async function GET() {
  try {
    const health = await verifyMistralHealth();
    return NextResponse.json(health, { status: health.ok ? 200 : 503 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al verificar Mistral";
    return NextResponse.json({ configured: false, ok: false, message: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const body = (await req.json()) as { query?: unknown; solution_ids?: unknown };
    const query = String(body.query ?? "").trim();
    const ids = (Array.isArray(body.solution_ids) ? body.solution_ids : [])
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0)
      .slice(0, 8);
    const sellerSolutions = await getActiveSellerSolutionsByIds(actor.id, ids);
    if (!sellerSolutions.length) {
      return NextResponse.json(
        { error: "Selecciona al menos un producto o servicio activo de tu Perfil del vendedor." },
        { status: 400 }
      );
    }
    await assertMistralRateLimit(actor.id);
    const result = await interpretSmartSearch(
      query,
      sellerSolutions.map((solution) => ({
        id: solution.id,
        name: solution.name,
        summary: solution.summary,
        fit_roles: solution.fit_roles,
        industries: solution.industries,
        talking_points: solution.talking_points,
      }))
    );
    const eligibleRanges = result.filters.employeeRanges.filter((range) =>
      SMART_ELIGIBLE_EMPLOYEE_RANGES.has(range)
    );
    result.filters.employeeRanges = eligibleRanges.length
      ? eligibleRanges
      : ["51,200", "201,10000"];
    if (!eligibleRanges.length) {
      result.summary = `${result.summary} · Tamaño objetivo: empresas medianas o grandes.`;
    }
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo interpretar la búsqueda";
    const status =
      e instanceof UsageLimitError
        ? e.status
        : e instanceof SmartSearchError && e.status
          ? e.status
          : e instanceof SmartSearchError
            ? 400
            : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
