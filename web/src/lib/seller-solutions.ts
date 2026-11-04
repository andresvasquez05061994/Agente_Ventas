import type { IACSolution } from "./iac-portfolio-knowledge";
import { getSql } from "./db";

export const MAX_SELLER_SOLUTIONS = 30;

export type SellerSolution = {
  id: number;
  name: string;
  summary: string;
  value_proposition: string;
  metrics: string[];
  fit_roles: string[];
  industries: string[];
  talking_points: string[];
  source_label: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type SellerSolutionInput = Omit<
  SellerSolution,
  "id" | "created_at" | "updated_at"
>;

const EMPTY_SOLUTION: SellerSolutionInput = {
  name: "",
  summary: "",
  value_proposition: "",
  metrics: [],
  fit_roles: [],
  industries: [],
  talking_points: [],
  source_label: "Creado en Perfil del vendedor",
  active: true,
};

function asList(value: unknown, max = 12): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,;\n]/)
      : [];
  const seen = new Set<string>();
  const list: string[] = [];
  for (const raw of values) {
    const item = String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, 180);
    if (!item) continue;
    const key = item.toLocaleLowerCase("es");
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(item);
    if (list.length >= max) break;
  }
  return list;
}

export function normalizeSellerSolutionInput(input: Partial<SellerSolutionInput>): SellerSolutionInput {
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (!name) throw new Error("Escribe el nombre del producto o servicio.");

  return {
    name,
    summary: String(input.summary ?? "").trim().slice(0, 700),
    value_proposition: String(input.value_proposition ?? "").trim().slice(0, 700),
    metrics: asList(input.metrics),
    fit_roles: asList(input.fit_roles),
    industries: asList(input.industries),
    talking_points: asList(input.talking_points),
    source_label:
      String(input.source_label ?? EMPTY_SOLUTION.source_label).trim().slice(0, 220) ||
      EMPTY_SOLUTION.source_label,
    active: input.active !== false,
  };
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return asList(value);
  if (typeof value === "string") {
    try {
      return asList(JSON.parse(value));
    } catch {
      return asList(value);
    }
  }
  return [];
}

function asDate(value: unknown): string {
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

function mapSolution(row: Record<string, unknown>): SellerSolution {
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    summary: String(row.summary ?? ""),
    value_proposition: String(row.value_proposition ?? ""),
    metrics: parseList(row.metrics),
    fit_roles: parseList(row.fit_roles),
    industries: parseList(row.industries),
    talking_points: parseList(row.talking_points),
    source_label: String(row.source_label ?? EMPTY_SOLUTION.source_label),
    active: Boolean(row.active),
    created_at: asDate(row.created_at),
    updated_at: asDate(row.updated_at),
  };
}

export async function listSellerSolutions(ownerId: number): Promise<SellerSolution[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM seller_solutions
    WHERE owner_id = ${ownerId}
    ORDER BY active DESC, updated_at DESC, id DESC
  `) as Record<string, unknown>[];
  return rows.map(mapSolution);
}

export async function listActiveSellerSolutions(ownerId: number): Promise<SellerSolution[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM seller_solutions
    WHERE owner_id = ${ownerId} AND active = TRUE
    ORDER BY updated_at DESC, id DESC
  `) as Record<string, unknown>[];
  return rows.map(mapSolution);
}

export async function getActiveSellerSolutionsByIds(
  ownerId: number,
  ids: number[]
): Promise<SellerSolution[]> {
  const normalized = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 8);
  if (!normalized.length) return [];
  const all = await listActiveSellerSolutions(ownerId);
  const selected = new Set(normalized);
  return all.filter((solution) => selected.has(solution.id));
}

export async function createSellerSolution(
  ownerId: number,
  input: Partial<SellerSolutionInput>
): Promise<SellerSolution> {
  const current = await listSellerSolutions(ownerId);
  if (current.length >= MAX_SELLER_SOLUTIONS) {
    throw new Error(`Máximo ${MAX_SELLER_SOLUTIONS} productos o servicios en el perfil.`);
  }
  const data = normalizeSellerSolutionInput(input);
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO seller_solutions (
      owner_id, name, summary, value_proposition, metrics, fit_roles, industries,
      talking_points, source_label, active, created_at, updated_at
    ) VALUES (
      ${ownerId}, ${data.name}, ${data.summary}, ${data.value_proposition},
      ${JSON.stringify(data.metrics)}::jsonb, ${JSON.stringify(data.fit_roles)}::jsonb,
      ${JSON.stringify(data.industries)}::jsonb, ${JSON.stringify(data.talking_points)}::jsonb,
      ${data.source_label}, ${data.active}, NOW(), NOW()
    )
    RETURNING *
  `) as Record<string, unknown>[];
  return mapSolution(rows[0]);
}

export async function updateSellerSolution(
  ownerId: number,
  id: number,
  input: Partial<SellerSolutionInput>
): Promise<SellerSolution | null> {
  const existing = (await listSellerSolutions(ownerId)).find((solution) => solution.id === id);
  if (!existing) return null;
  const data = normalizeSellerSolutionInput({ ...existing, ...input });
  const sql = getSql();
  const rows = (await sql`
    UPDATE seller_solutions
    SET
      name = ${data.name},
      summary = ${data.summary},
      value_proposition = ${data.value_proposition},
      metrics = ${JSON.stringify(data.metrics)}::jsonb,
      fit_roles = ${JSON.stringify(data.fit_roles)}::jsonb,
      industries = ${JSON.stringify(data.industries)}::jsonb,
      talking_points = ${JSON.stringify(data.talking_points)}::jsonb,
      source_label = ${data.source_label},
      active = ${data.active},
      updated_at = NOW()
    WHERE id = ${id} AND owner_id = ${ownerId}
    RETURNING *
  `) as Record<string, unknown>[];
  return rows[0] ? mapSolution(rows[0]) : null;
}

export async function deleteSellerSolution(ownerId: number, id: number): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM seller_solutions
    WHERE id = ${id} AND owner_id = ${ownerId}
    RETURNING id
  `) as Array<{ id: number }>;
  return Boolean(rows[0]);
}

/** Adaptador común para el motor de match y Mensaje IA. */
export function sellerSolutionToIacSolution(solution: SellerSolution): IACSolution {
  return {
    id: `seller-${solution.id}`,
    name: solution.name,
    summary: solution.summary || solution.value_proposition || solution.name,
    metrics: solution.metrics,
    fit_roles: solution.fit_roles.map((item) => item.toLowerCase()),
    industries: solution.industries.map((item) => item.toLowerCase()),
    talking_points:
      solution.talking_points.length > 0
        ? solution.talking_points
        : solution.value_proposition
          ? [solution.value_proposition]
          : [],
    evidence: "perfil",
    source: `Perfil del vendedor · ${solution.source_label}`,
  };
}
