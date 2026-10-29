import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { ensureDb, saveEnrichmentOutcome } from "@/lib/db";
import type { EnrichmentConfig, EnrichmentOutcome, EnrichmentSource } from "@/lib/enrichment-session";
import type { EnrichRowStatus } from "@/lib/excel-enrich";

export const dynamic = "force-dynamic";

const STATUSES = new Set<EnrichRowStatus>([
  "pending",
  "filled",
  "already",
  "portfolio",
  "not_found",
  "no_contacts",
  "invalid_country",
  "insufficient_data",
  "error",
]);
const SOURCES = new Set<EnrichmentSource>(["portfolio", "apollo", "validation", "error"]);

function stringList(value: unknown, max: number, width = 500): string[] | null {
  if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== "string")) return null;
  return value.map((item) => item.slice(0, width));
}

function outputRows(value: unknown): string[][] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const rows: string[][] = [];
  for (const row of value) {
    const parsed = stringList(row, 250, 2000);
    if (!parsed) return null;
    rows.push(parsed);
  }
  return rows;
}

function configOf(value: unknown): Partial<EnrichmentConfig> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  return {
    searchBy: Array.isArray(raw.searchBy) ? raw.searchBy.filter((item): item is EnrichmentConfig["searchBy"][number] => typeof item === "string") : [],
    allCountries: raw.allCountries === true,
    countries: Array.isArray(raw.countries) ? raw.countries.filter((item): item is string => typeof item === "string").slice(0, 20) : [],
    fallbackTitles: typeof raw.fallbackTitles === "string" ? raw.fallbackTitles.slice(0, 500) : "",
    fallbackIndustry: typeof raw.fallbackIndustry === "string" ? raw.fallbackIndustry.slice(0, 120) : "",
    fallbackEmployeeRange: typeof raw.fallbackEmployeeRange === "string" ? raw.fallbackEmployeeRange.slice(0, 120) : "",
    contactsPerRow: Math.min(10, Math.max(1, Math.floor(Number(raw.contactsPerRow) || 3))),
  };
}

export async function POST(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const body = (await req.json()) as Record<string, unknown>;
    const jobId = Math.floor(Number(body.jobId));
    const headers = stringList(body.headers, 250);
    const columns = Array.isArray(body.columns) && body.columns.length <= 250 ? body.columns : null;
    const rawOutcome = body.outcome as Record<string, unknown> | undefined;
    const rows = outputRows(rawOutcome?.rows);
    const status = String(rawOutcome?.status ?? "") as EnrichRowStatus;
    const source = String(rawOutcome?.source ?? "") as EnrichmentSource;
    const sourceIndex = Math.floor(Number(rawOutcome?.sourceIndex));
    const credits = Math.max(0, Math.min(10000, Math.floor(Number(rawOutcome?.credits) || 0)));
    if (
      !Number.isInteger(jobId) || jobId < 1 || !headers || !columns || !rows ||
      !Number.isInteger(sourceIndex) || sourceIndex < 0 || !STATUSES.has(status) || !SOURCES.has(source)
    ) {
      return NextResponse.json({ error: "El avance de enriquecimiento no es válido." }, { status: 400 });
    }
    const outcome: EnrichmentOutcome = { sourceIndex, status, source, rows, credits };
    const saved = await saveEnrichmentOutcome({
      ownerId: actor.id,
      jobId,
      headers,
      columns,
      config: configOf(body.config),
      outcome,
    });
    if (!saved) return NextResponse.json({ error: "La sesión no existe o no te pertenece." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar el avance de enriquecimiento.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
