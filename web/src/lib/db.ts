import { neon } from "@neondatabase/serverless";
import type {
  ConversationStats,
  ConversationThread,
  Lead,
  LeadStatus,
  MessageDirection,
  WhatsAppMessage,
} from "./types";
import { isLeadStatus } from "./types";

const LEADS_PAGE_SIZE = 20;
const LEADS_EXPORT_MAX = 10_000;

export type LeadsPage = {
  leads: Lead[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
};

let dbReady: Promise<void> | null = null;

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no configurada");
  return neon(url);
}

/** Inicializa tablas una sola vez por instancia serverless (evita 3 CREATE en cada request). */
export function ensureDb(): Promise<void> {
  if (!dbReady) {
    dbReady = initDb().catch((err) => {
      dbReady = null;
      throw err;
    });
  }
  return dbReady;
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
  await sql`
    CREATE INDEX IF NOT EXISTS idx_leads_status_created
    ON leads (lead_status, created_at DESC)
  `;
  await sql`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS mistral_conversation_id TEXT
  `;
  await sql`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_status TEXT NOT NULL DEFAULT 'Nuevo'
  `;
  await sql`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_status TEXT NOT NULL DEFAULT 'No iniciado'
  `;
  await sql`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS notas TEXT
  `;
  await sql`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS fuente_busqueda TEXT
  `;
  await sql`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      telefono TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_wa_messages_lead_created
    ON whatsapp_messages (lead_id, created_at DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_status
    ON leads (whatsapp_status, updated_at DESC)
  `;
}

export async function getPortfolioApolloIds(): Promise<Set<string>> {
  const sql = getSql();
  const rows = (await sql`
    SELECT apollo_id FROM leads
    WHERE apollo_id IS NOT NULL AND TRIM(apollo_id) <> ''
  `) as Array<{ apollo_id: string }>;
  return new Set(rows.map((r) => String(r.apollo_id).trim()).filter(Boolean));
}

export async function searchDistinctCompanies(
  query: string,
  limit = 6
): Promise<string[]> {
  const sql = getSql();
  const term = query.trim();
  if (term.length < 2) return [];
  const pattern = `%${term}%`;

  const rows = await sql`
    SELECT DISTINCT empresa
    FROM leads
    WHERE empresa IS NOT NULL
      AND TRIM(empresa) <> ''
      AND empresa ILIKE ${pattern}
    ORDER BY empresa ASC
    LIMIT ${limit}
  `;

  return rows
    .map((r) => String((r as { empresa: string }).empresa ?? "").trim())
    .filter(Boolean);
}

export async function getLeads(
  filters?: {
    status?: string;
    search?: string;
    contact?: string;
  },
  pagination?: { page?: number; perPage?: number; all?: boolean }
): Promise<LeadsPage> {
  const sql = getSql();
  const status =
    filters?.status && filters.status !== "Todos" ? filters.status : null;
  const term = filters?.search?.trim() || null;
  const pattern = term ? `%${term}%` : null;
  const contact =
    filters?.contact && filters.contact !== "Todos" ? filters.contact : null;

  const [countRow] = await sql`
    SELECT COUNT(*)::int AS total FROM leads
    WHERE (${status}::text IS NULL OR lead_status = ${status})
      AND (
        ${pattern}::text IS NULL
        OR nombre ILIKE ${pattern}
        OR empresa ILIKE ${pattern}
        OR cargo ILIKE ${pattern}
      )
      AND (
        ${contact}::text IS NULL
        OR (${contact} = 'Con teléfono' AND telefono IS NOT NULL AND telefono <> '')
        OR (${contact} = 'Sin teléfono' AND (telefono IS NULL OR telefono = ''))
        OR (${contact} = 'Con email' AND email IS NOT NULL AND email <> '')
        OR (${contact} = 'Sin email' AND (email IS NULL OR email = ''))
      )
  `;
  const total = (countRow as { total: number })?.total ?? 0;

  const perPage = pagination?.all
    ? Math.min(total || LEADS_EXPORT_MAX, LEADS_EXPORT_MAX)
    : Math.min(100, Math.max(1, pagination?.perPage ?? LEADS_PAGE_SIZE));
  const totalPages = pagination?.all
    ? 1
    : Math.max(1, Math.ceil(total / perPage));
  const page = pagination?.all
    ? 1
    : Math.min(Math.max(1, pagination?.page ?? 1), totalPages);
  const offset = (page - 1) * perPage;

  const leads = (await sql`
    SELECT * FROM leads
    WHERE (${status}::text IS NULL OR lead_status = ${status})
      AND (
        ${pattern}::text IS NULL
        OR nombre ILIKE ${pattern}
        OR empresa ILIKE ${pattern}
        OR cargo ILIKE ${pattern}
      )
      AND (
        ${contact}::text IS NULL
        OR (${contact} = 'Con teléfono' AND telefono IS NOT NULL AND telefono <> '')
        OR (${contact} = 'Sin teléfono' AND (telefono IS NULL OR telefono = ''))
        OR (${contact} = 'Con email' AND email IS NOT NULL AND email <> '')
        OR (${contact} = 'Sin email' AND (email IS NULL OR email = ''))
      )
    ORDER BY created_at ASC, id ASC
    LIMIT ${perPage}
    OFFSET ${offset}
  `) as Lead[];

  return { leads, total, page, perPage, totalPages };
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

    // En re-guardados desde prospección se conservan lead_status, notas, whatsapp_status y created_at.
    const rows = await sql`
      INSERT INTO leads (
        apollo_id, nombre, cargo, empresa, email, telefono,
        pais, linkedin_url, lead_status, fuente_busqueda, created_at, updated_at
      ) VALUES (
        ${lead.apollo_id}, ${lead.nombre}, ${lead.cargo}, ${lead.empresa},
        ${email}, ${telefono}, ${lead.pais}, ${lead.linkedin_url},
        'Nuevo', ${fuente}, NOW(), NOW()
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
  const [row] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE lead_status = 'Aprobado para contacto')::int AS approved,
      COUNT(*) FILTER (WHERE telefono IS NOT NULL AND telefono != '')::int AS with_phone,
      COUNT(*) FILTER (WHERE email IS NOT NULL AND email != '')::int AS with_email
    FROM leads
  `;
  const r = row as {
    total: number;
    approved: number;
    with_phone: number;
    with_email: number;
  };
  return {
    total: r?.total ?? 0,
    approved: r?.approved ?? 0,
    with_phone: r?.with_phone ?? 0,
    with_email: r?.with_email ?? 0,
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

export async function updateLeadStatus(id: number, status: LeadStatus): Promise<Lead> {
  if (!isLeadStatus(status)) {
    throw new Error(`Estado de lead no válido: ${String(status)}`);
  }

  const sql = getSql();
  const leadId = Number(id);
  if (!Number.isFinite(leadId) || leadId <= 0) {
    throw new Error("ID de contacto no válido");
  }

  const rows = (await sql`
    UPDATE leads
    SET lead_status = ${status}, updated_at = NOW()
    WHERE id = ${leadId}
    RETURNING *
  `) as Lead[];

  const lead = rows[0];
  if (!lead) {
    throw new Error("Contacto no encontrado");
  }
  return lead;
}

export async function updateLeadNotes(id: number, notas: string): Promise<Lead> {
  const sql = getSql();
  const leadId = Number(id);
  if (!Number.isFinite(leadId) || leadId <= 0) {
    throw new Error("ID de contacto no válido");
  }

  const rows = (await sql`
    UPDATE leads SET notas = ${notas}, updated_at = NOW()
    WHERE id = ${leadId}
    RETURNING *
  `) as Lead[];

  const lead = rows[0];
  if (!lead) {
    throw new Error("Contacto no encontrado");
  }
  return lead;
}

export async function deleteLead(id: number) {
  const sql = getSql();
  await sql`DELETE FROM leads WHERE id = ${id}`;
}

export async function clearAllLeads(): Promise<number> {
  const sql = getSql();
  const rows = await sql`DELETE FROM leads RETURNING id`;
  return rows.length;
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

export async function getConversationStats(): Promise<ConversationStats> {
  const sql = getSql();
  const [row] = await sql`
    SELECT
      COUNT(*) FILTER (
        WHERE EXISTS (SELECT 1 FROM whatsapp_messages m WHERE m.lead_id = leads.id)
          OR whatsapp_status <> 'No iniciado'
      )::int AS total_threads,
      COUNT(*) FILTER (WHERE whatsapp_status = 'En conversación')::int AS active,
      COUNT(*) FILTER (WHERE whatsapp_status IN ('Pendiente', 'Encolado'))::int AS pending,
      COUNT(*) FILTER (WHERE whatsapp_status = 'Agendado')::int AS scheduled,
      COUNT(*) FILTER (WHERE whatsapp_status IN ('Error', 'Sin teléfono'))::int AS errors,
      COUNT(*) FILTER (
        WHERE whatsapp_status IN ('Enviado', 'En conversación')
          AND EXISTS (
            SELECT 1 FROM whatsapp_messages m
            WHERE m.lead_id = leads.id AND m.direction = 'outbound'
              AND m.created_at > COALESCE(
                (SELECT MAX(m2.created_at) FROM whatsapp_messages m2
                 WHERE m2.lead_id = leads.id AND m2.direction = 'inbound'),
                '1970-01-01'::timestamptz
              )
          )
      )::int AS awaiting_reply
    FROM leads
  `;
  const r = row as ConversationStats;
  return {
    total_threads: r?.total_threads ?? 0,
    active: r?.active ?? 0,
    pending: r?.pending ?? 0,
    scheduled: r?.scheduled ?? 0,
    errors: r?.errors ?? 0,
    awaiting_reply: r?.awaiting_reply ?? 0,
  };
}

export async function getConversationThreads(
  filter: string = "all",
  search?: string
): Promise<ConversationThread[]> {
  const sql = getSql();
  const term = search?.trim() || null;
  const pattern = term ? `%${term}%` : null;

  const rows = (await sql`
    SELECT
      l.id,
      l.nombre,
      l.empresa,
      l.cargo,
      l.telefono,
      l.email,
      l.lead_status,
      l.whatsapp_status,
      l.notas,
      latest.content AS last_message,
      latest.direction AS last_direction,
      latest.created_at AS last_message_at,
      COALESCE(mc.cnt, 0)::int AS message_count
    FROM leads l
    LEFT JOIN LATERAL (
      SELECT content, direction, created_at
      FROM whatsapp_messages
      WHERE lead_id = l.id
      ORDER BY created_at DESC
      LIMIT 1
    ) latest ON TRUE
    LEFT JOIN (
      SELECT lead_id, COUNT(*)::int AS cnt
      FROM whatsapp_messages
      GROUP BY lead_id
    ) mc ON mc.lead_id = l.id
    WHERE (
      latest.content IS NOT NULL
      OR l.whatsapp_status <> 'No iniciado'
    )
    AND (
      ${pattern}::text IS NULL
      OR l.nombre ILIKE ${pattern}
      OR l.empresa ILIKE ${pattern}
      OR l.telefono ILIKE ${pattern}
    )
    AND (
      ${filter}::text = 'all'
      OR (${filter} = 'active' AND l.whatsapp_status = 'En conversación')
      OR (${filter} = 'pending' AND l.whatsapp_status IN ('Pendiente', 'Encolado'))
      OR (${filter} = 'scheduled' AND l.whatsapp_status = 'Agendado')
      OR (${filter} = 'error' AND l.whatsapp_status IN ('Error', 'Sin teléfono'))
      OR (
        ${filter} = 'awaiting'
        AND l.whatsapp_status IN ('Enviado', 'En conversación')
        AND EXISTS (
          SELECT 1 FROM whatsapp_messages m
          WHERE m.lead_id = l.id AND m.direction = 'outbound'
            AND m.created_at > COALESCE(
              (SELECT MAX(m2.created_at) FROM whatsapp_messages m2
               WHERE m2.lead_id = l.id AND m2.direction = 'inbound'),
              '1970-01-01'::timestamptz
            )
        )
      )
    )
    ORDER BY COALESCE(latest.created_at, l.updated_at) DESC
    LIMIT 200
  `) as ConversationThread[];

  return rows;
}

export async function getLeadById(id: number): Promise<Lead | null> {
  const sql = getSql();
  const rows = (await sql`SELECT * FROM leads WHERE id = ${id}`) as Lead[];
  return rows[0] ?? null;
}

export async function getLeadByPhone(telefono: string): Promise<Lead | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM leads WHERE telefono = ${telefono} LIMIT 1
  `) as Lead[];
  return rows[0] ?? null;
}

export async function getMessagesForLead(leadId: number): Promise<WhatsAppMessage[]> {
  const sql = getSql();
  return (await sql`
    SELECT id, lead_id, telefono, direction, content, created_at
    FROM whatsapp_messages
    WHERE lead_id = ${leadId}
    ORDER BY created_at ASC
  `) as WhatsAppMessage[];
}

export async function saveWhatsAppMessage(
  leadId: number,
  telefono: string,
  direction: MessageDirection,
  content: string
): Promise<WhatsAppMessage> {
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO whatsapp_messages (lead_id, telefono, direction, content)
    VALUES (${leadId}, ${telefono}, ${direction}, ${content})
    RETURNING id, lead_id, telefono, direction, content, created_at
  `) as WhatsAppMessage[];
  await sql`UPDATE leads SET updated_at = NOW() WHERE id = ${leadId}`;
  return rows[0];
}

export async function updateLeadWhatsAppStatus(
  id: number,
  whatsappStatus: string
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE leads SET whatsapp_status = ${whatsappStatus}, updated_at = NOW()
    WHERE id = ${id}
  `;
}

export async function updateLeadConversationId(
  id: number,
  conversationId: string
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE leads
    SET mistral_conversation_id = ${conversationId}, updated_at = NOW()
    WHERE id = ${id}
  `;
}
