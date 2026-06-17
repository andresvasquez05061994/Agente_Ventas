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
  let skipped = 0;

  for (const lead of leads) {
    const rows = await sql`
      INSERT INTO leads (
        apollo_id, nombre, cargo, empresa, email, telefono,
        pais, linkedin_url, lead_status, fuente_busqueda
      ) VALUES (
        ${lead.apollo_id}, ${lead.nombre}, ${lead.cargo}, ${lead.empresa},
        ${lead.email}, ${lead.telefono}, ${lead.pais}, ${lead.linkedin_url},
        'Nuevo', ${fuente}
      )
      ON CONFLICT (apollo_id) DO NOTHING
      RETURNING id
    `;
    if (rows.length) inserted++;
    else skipped++;
  }
  return { inserted, skipped };
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
