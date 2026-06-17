import { neon } from "@neondatabase/serverless";
import type { Lead, LeadStatus } from "./types";

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no configurada");
  return neon(url);
}

export async function initDb() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      apollo_id TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      cargo TEXT,
      empresa TEXT,
      email TEXT,
      telefono TEXT,
      pais TEXT,
      linkedin_url TEXT,
      lead_status TEXT NOT NULL DEFAULT 'Nuevo',
      whatsapp_status TEXT NOT NULL DEFAULT 'No iniciado',
      notas TEXT,
      fuente_busqueda TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS apollo_phone_cache (
      apollo_id TEXT PRIMARY KEY,
      telefono TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS apollo_prospeccion_credits (
      id SERIAL PRIMARY KEY,
      credits INTEGER NOT NULL DEFAULT 0,
      contactos_enriquecidos INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'search',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function getLeads(filters?: {
  status?: string;
  search?: string;
  contact?: string;
}): Promise<Lead[]> {
  const sql = getSql();
  const rows = (await sql`SELECT * FROM leads ORDER BY created_at DESC`) as Lead[];

  return rows.filter((lead) => {
    if (filters?.status && filters.status !== "Todos" && lead.lead_status !== filters.status)
      return false;
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      const hay = [lead.nombre, lead.empresa, lead.cargo]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
      if (!hay) return false;
    }
    if (filters?.contact === "Con teléfono" && !lead.telefono) return false;
    if (filters?.contact === "Sin teléfono" && lead.telefono) return false;
    if (filters?.contact === "Con email" && !lead.email) return false;
    if (filters?.contact === "Sin email" && lead.email) return false;
    return true;
  });
}

export async function saveLeads(
  leads: {
    apollo_id: string;
    nombre: string;
    cargo: string | null;
    empresa: string | null;
    email: string | null;
    telefono: string | null;
    pais: string | null;
    linkedin_url: string | null;
  }[],
  fuente: string
) {
  const sql = getSql();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const lead of leads) {
    const email = lead.email?.trim() || null;
    const telefono = lead.telefono?.trim() || null;
    if (!email || !telefono) {
      skipped++;
      continue;
    }

    const rows = await sql`
      INSERT INTO leads (
        apollo_id, nombre, cargo, empresa, email, telefono,
        pais, linkedin_url, lead_status, fuente_busqueda
      ) VALUES (
        ${lead.apollo_id}, ${lead.nombre}, ${lead.cargo}, ${lead.empresa},
        ${email}, ${telefono}, ${lead.pais}, ${lead.linkedin_url},
        'Nuevo', ${fuente}
      )
      ON CONFLICT (apollo_id) DO UPDATE SET
        nombre = EXCLUDED.nombre,
        cargo = EXCLUDED.cargo,
        empresa = EXCLUDED.empresa,
        email = EXCLUDED.email,
        telefono = EXCLUDED.telefono,
        pais = EXCLUDED.pais,
        linkedin_url = EXCLUDED.linkedin_url,
        fuente_busqueda = EXCLUDED.fuente_busqueda,
        updated_at = NOW()
      RETURNING id, (xmax = 0) AS is_insert
    `;
    const row = rows[0] as { id: number; is_insert: boolean } | undefined;
    if (!row) {
      skipped++;
      continue;
    }
    if (row.is_insert) inserted++;
    else updated++;
  }
  return { inserted, updated, skipped };
}

export async function getStats() {
  const sql = getSql();
  const [total] = await sql`SELECT COUNT(*)::int AS c FROM leads`;
  const [approved] = await sql`
    SELECT COUNT(*)::int AS c FROM leads WHERE lead_status = 'Aprobado para contacto'
  `;
  const [withPhone] = await sql`
    SELECT COUNT(*)::int AS c FROM leads WHERE telefono IS NOT NULL AND telefono != ''
  `;
  const [withEmail] = await sql`
    SELECT COUNT(*)::int AS c FROM leads WHERE email IS NOT NULL AND email != ''
  `;
  return {
    total: (total as { c: number })?.c ?? 0,
    approved: (approved as { c: number })?.c ?? 0,
    with_phone: (withPhone as { c: number })?.c ?? 0,
    with_email: (withEmail as { c: number })?.c ?? 0,
  };
}

export async function recordProspeccionCredits(
  credits: number,
  contactos: number,
  source: "search" | "phone_webhook" = "search"
) {
  const sql = getSql();
  await sql`
    INSERT INTO apollo_prospeccion_credits (credits, contactos_enriquecidos, source)
    VALUES (${Math.max(0, credits)}, ${Math.max(0, contactos)}, ${source})
  `;
}

export async function getApolloProspeccionCredits() {
  const sql = getSql();
  const [totals] = await sql`
    SELECT
      COALESCE(SUM(credits), 0)::int AS total_credits,
      COUNT(*) FILTER (WHERE source = 'search')::int AS total_searches,
      COALESCE(SUM(credits) FILTER (
        WHERE created_at >= date_trunc('month', NOW() AT TIME ZONE 'UTC')
      ), 0)::int AS credits_this_month,
      COUNT(*) FILTER (WHERE source = 'search' AND created_at >= date_trunc('month', NOW() AT TIME ZONE 'UTC'))::int AS searches_this_month
    FROM apollo_prospeccion_credits
  `;
  const row = totals as {
    total_credits: number;
    total_searches: number;
    credits_this_month: number;
    searches_this_month: number;
  };
  return {
    total_credits: row?.total_credits ?? 0,
    total_searches: row?.total_searches ?? 0,
    credits_this_month: row?.credits_this_month ?? 0,
    searches_this_month: row?.searches_this_month ?? 0,
  };
}

export async function updateLeadStatus(id: number, status: LeadStatus) {
  const sql = getSql();
  await sql`UPDATE leads SET lead_status = ${status}, updated_at = NOW() WHERE id = ${id}`;
}

export async function updateLeadNotes(id: number, notas: string) {
  const sql = getSql();
  await sql`UPDATE leads SET notas = ${notas}, updated_at = NOW() WHERE id = ${id}`;
}

export async function deleteLead(id: number) {
  const sql = getSql();
  await sql`DELETE FROM leads WHERE id = ${id}`;
}

export async function savePhoneCache(apolloId: string, telefono: string) {
  const sql = getSql();
  await sql`
    INSERT INTO apollo_phone_cache (apollo_id, telefono, updated_at)
    VALUES (${apolloId}, ${telefono}, NOW())
    ON CONFLICT (apollo_id) DO UPDATE
    SET telefono = EXCLUDED.telefono, updated_at = NOW()
  `;
}

export async function getPhoneCache(apolloIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!apolloIds.length) return map;

  const sql = getSql();
  const rows = (await sql`
    SELECT apollo_id, telefono FROM apollo_phone_cache
    WHERE apollo_id = ANY(${apolloIds})
  `) as Array<{ apollo_id: string; telefono: string }>;

  for (const row of rows) {
    if (row.telefono) map.set(row.apollo_id, row.telefono);
  }
  return map;
}
