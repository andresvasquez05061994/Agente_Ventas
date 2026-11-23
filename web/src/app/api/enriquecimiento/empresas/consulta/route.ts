import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { consumeRateWindow, ensureDb } from "@/lib/db";
import {
  isDatosGovConfigured,
  lookupSupersociedadesCompany,
  OfficialCompanyLookupError,
} from "@/lib/official-company-lookup";
import { saveCompanyVerification } from "@/lib/official-company-data";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const MAX_LOOKUPS_PER_WINDOW = 20;
const LOOKUP_WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;

    if (!isDatosGovConfigured()) {
      return NextResponse.json(
        { error: "La consulta oficial no está configurada. Agrega DATOS_GOV_APP_TOKEN como secreto del servidor." },
        { status: 503 }
      );
    }

    const body = (await req.json()) as { nit?: unknown };
    const gate = await consumeRateWindow(
      `datos-gov:company-lookup:user:${actor.id}`,
      MAX_LOOKUPS_PER_WINDOW,
      LOOKUP_WINDOW_MS
    );
    if (gate.limited) {
      return NextResponse.json(
        { error: `Alcanzaste 20 consultas oficiales en 15 minutos. Intenta de nuevo en ${gate.retrySec}s.` },
        { status: 429 }
      );
    }

    const record = await lookupSupersociedadesCompany(body.nit);
    if (!record) {
      return NextResponse.json({ record: null, message: "No encontré esa empresa en la fuente configurada." });
    }
    const verification = await saveCompanyVerification(actor.id, record);
    return NextResponse.json({ record: verification });
  } catch (error) {
    if (error instanceof OfficialCompanyLookupError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "No se pudo consultar la fuente oficial.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    return NextResponse.json({
      configured: isDatosGovConfigured(),
      source: "Datos Abiertos Colombia · Empresas grandes",
      employee_count_available: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo cargar la configuración de la fuente.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
