import { neon } from "@neondatabase/serverless";
import { decodeMonthlyBudget, encodeMonthlyBudget } from "./credit-policy";
import { applyMigrations } from "./migrations";
import { phoneMatchCandidates, toE164 } from "./phone";
import type {
  EnrichmentConfig,
  EnrichmentOutcome,
  EnrichmentSession,
} from "./enrichment-session";
import type {
  ConversationStats,
  ConversationThread,
  EtapaComercial,
  GeneratedMessageSummary,
  Lead,
  LeadStatus,
  MessageChannel,
  MessageDirection,
  WhatsAppMessage,
} from "./types";
import {
  isEtapaComercial,
  isGestionResultado,
  isLeadStatus,
  type GestionResultado,
} from "./types";

const LEADS_PAGE_SIZE = 20;
const LEADS_EXPORT_MAX = 10_000;

export type LeadsPage = {
  leads: Lead[];
  total: number;
  unfilteredTotal: number;
  page: number;
  perPage: number;
  totalPages: number;
};

let dbReady: Promise<void> | null = null;

export function getSql() {
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
  await applyMigrations(getSql());
  const { ensurePlatform } = await import("./users");
  await ensurePlatform();
}

export async function getPortfolioApolloIds(ownerId: number): Promise<Set<string>> {
  const sql = getSql();
  const rows = (await sql`
    SELECT apollo_id FROM leads
    WHERE owner_id = ${ownerId}
      AND apollo_id IS NOT NULL AND TRIM(apollo_id) <> ''
  `) as Array<{ apollo_id: string }>;
  return new Set(rows.map((r) => String(r.apollo_id).trim()).filter(Boolean));
}

export type BlockedContacts = { phones: Set<string>; emails: Set<string> };

/** Móvil y correo de contactos marcados No contesta. La búsqueda no los vuelve a ofrecer. */
export async function getNoContestaContacts(ownerId: number): Promise<BlockedContacts> {
  const sql = getSql();
  const rows = (await sql`
    SELECT telefono_e164, email
    FROM leads
    WHERE owner_id = ${ownerId}
      AND resultado_gestion = 'No contesta'
  `) as Array<{ telefono_e164: string | null; email: string | null }>;
  const phones = new Set<string>();
  const emails = new Set<string>();
  for (const row of rows) {
    const phone = row.telefono_e164?.replace(/\D/g, "");
    const email = row.email?.trim().toLowerCase();
    if (phone) phones.add(phone);
    if (email) emails.add(email);
  }
  return { phones, emails };
}

export function isNoContestaContact(
  person: { email?: string | null; telefono?: string | null; pais?: string | null },
  blocked: BlockedContacts
): boolean {
  const email = person.email?.trim().toLowerCase();
  if (email && blocked.emails.has(email)) return true;
  const phone = (toE164(person.telefono, person.pais) ?? "").replace(/\D/g, "");
  return Boolean(phone) && blocked.phones.has(phone);
}

export async function searchDistinctCompanies(
  query: string,
  limit = 6,
  ownerId: number | null = null
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
      AND (${ownerId}::int IS NULL OR owner_id = ${ownerId})
      AND empresa ILIKE ${pattern}
    ORDER BY empresa ASC
    LIMIT ${limit}
  `;

  return rows
    .map((r) => String((r as { empresa: string }).empresa ?? "").trim())
    .filter(Boolean);
}

export async function listPortfolioContacts(ownerId: number | null = null): Promise<
  Array<{
    nombre: string;
    cargo: string | null;
    empresa: string | null;
    email: string | null;
    telefono: string | null;
    telefono_e164: string | null;
    pais: string | null;
    linkedin_url: string | null;
    lead_status: string;
    whatsapp_status: string | null;
    notas: string | null;
    fuente_busqueda: string | null;
  }>
> {
  const sql = getSql();
  return (await sql`
    SELECT nombre, cargo, empresa, email, telefono, telefono_e164, pais, linkedin_url,
           lead_status, whatsapp_status, notas, fuente_busqueda
    FROM leads
    WHERE empresa IS NOT NULL AND TRIM(empresa) <> ''
      AND (${ownerId}::int IS NULL OR owner_id = ${ownerId})
    ORDER BY empresa ASC, nombre ASC
    LIMIT 10000
  `) as Array<{
    nombre: string;
    cargo: string | null;
    empresa: string | null;
    email: string | null;
    telefono: string | null;
    telefono_e164: string | null;
    pais: string | null;
    linkedin_url: string | null;
    lead_status: string;
    whatsapp_status: string | null;
    notas: string | null;
    fuente_busqueda: string | null;
  }>;
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

type EnrichmentJobRow = {
  id: number | string;
  fingerprint: string;
  filename: string;
  headers: unknown;
  columns: unknown;
  source_rows: number | string;
  config: unknown;
};

type EnrichmentStoredRow = {
  source_index: number | string;
  status: string;
  source: string;
  output_rows: unknown;
  credits: number | string;
};

function asEnrichmentSession(job: EnrichmentJobRow, outcomes: EnrichmentStoredRow[]): EnrichmentSession {
  return {
    id: Number(job.id),
    fingerprint: String(job.fingerprint),
    filename: String(job.filename ?? ""),
    headers: parseJsonValue<string[]>(job.headers, []),
    columns: parseJsonValue(job.columns, []),
    sourceRows: Number(job.source_rows),
    config: parseJsonValue<Partial<EnrichmentConfig>>(job.config, {}),
    outcomes: outcomes.map((row) => ({
      sourceIndex: Number(row.source_index),
      status: row.status as EnrichmentOutcome["status"],
      source: row.source as EnrichmentOutcome["source"],
      rows: parseJsonValue<string[][]>(row.output_rows, []),
      credits: Number(row.credits) || 0,
    })),
  };
}

async function getEnrichmentSessionById(id: number, ownerId: number): Promise<EnrichmentSession | null> {
  const sql = getSql();
  const jobs = (await sql`
    SELECT id, fingerprint, filename, headers, columns, source_rows, config
    FROM enrichment_jobs
    WHERE id = ${id} AND owner_id = ${ownerId}
  `) as EnrichmentJobRow[];
  const job = jobs[0];
  if (!job) return null;
  const outcomes = (await sql`
    SELECT source_index, status, source, output_rows, credits
    FROM enrichment_job_rows
    WHERE job_id = ${id}
    ORDER BY source_index ASC
  `) as EnrichmentStoredRow[];
  return asEnrichmentSession(job, outcomes);
}

export async function getOrCreateEnrichmentSession(input: {
  ownerId: number;
  fingerprint: string;
  filename: string;
  headers: string[];
  columns: unknown[];
  sourceRows: number;
}): Promise<{ session: EnrichmentSession; resumed: boolean }> {
  const sql = getSql();
  const existing = (await sql`
    SELECT id
    FROM enrichment_jobs
    WHERE owner_id = ${input.ownerId} AND fingerprint = ${input.fingerprint}
  `) as Array<{ id: number | string }>;
  if (existing[0]) {
    const session = await getEnrichmentSessionById(Number(existing[0].id), input.ownerId);
    if (session) return { session, resumed: true };
  }

  const created = (await sql`
    INSERT INTO enrichment_jobs (owner_id, fingerprint, filename, headers, columns, source_rows)
    VALUES (
      ${input.ownerId}, ${input.fingerprint}, ${input.filename},
      ${JSON.stringify(input.headers)}::jsonb, ${JSON.stringify(input.columns)}::jsonb,
      ${input.sourceRows}
    )
    ON CONFLICT (owner_id, fingerprint) DO UPDATE
      SET updated_at = enrichment_jobs.updated_at
    RETURNING id
  `) as Array<{ id: number | string }>;
  const id = Number(created[0]?.id);
  const session = await getEnrichmentSessionById(id, input.ownerId);
  if (!session) throw new Error("No se pudo iniciar la sesión de enriquecimiento.");
  return { session, resumed: Boolean(existing[0]) };
}

export async function saveEnrichmentOutcome(input: {
  ownerId: number;
  jobId: number;
  headers: string[];
  columns: unknown[];
  config: Partial<EnrichmentConfig>;
  outcome: EnrichmentOutcome;
}): Promise<boolean> {
  const sql = getSql();
  const owners = (await sql`
    SELECT source_rows
    FROM enrichment_jobs
    WHERE id = ${input.jobId} AND owner_id = ${input.ownerId}
  `) as Array<{ source_rows: number | string }>;
  const sourceRows = Number(owners[0]?.source_rows);
  if (!sourceRows || input.outcome.sourceIndex < 0 || input.outcome.sourceIndex >= sourceRows) return false;

  await sql`
    UPDATE enrichment_jobs
    SET headers = ${JSON.stringify(input.headers)}::jsonb,
        columns = ${JSON.stringify(input.columns)}::jsonb,
        config = ${JSON.stringify(input.config)}::jsonb,
        updated_at = NOW()
    WHERE id = ${input.jobId} AND owner_id = ${input.ownerId}
  `;
  await sql`
    INSERT INTO enrichment_job_rows (
      job_id, source_index, status, source, output_rows, credits, created_at, updated_at
    ) VALUES (
      ${input.jobId}, ${input.outcome.sourceIndex}, ${input.outcome.status}, ${input.outcome.source},
      ${JSON.stringify(input.outcome.rows)}::jsonb, ${input.outcome.credits}, NOW(), NOW()
    )
    ON CONFLICT (job_id, source_index) DO UPDATE SET
      status = EXCLUDED.status,
      source = EXCLUDED.source,
      output_rows = EXCLUDED.output_rows,
      credits = EXCLUDED.credits,
      updated_at = NOW()
  `;
  return true;
}

export async function getLeads(
  filters?: {
    status?: string;
    resultado?: string;
    etapa?: string;
    search?: string;
    contact?: string;
  },
  pagination?: { page?: number; perPage?: number; all?: boolean },
  ownerId: number | null = null
): Promise<LeadsPage> {
  const sql = getSql();
  const status =
    filters?.status && filters.status !== "Todos" ? filters.status : null;
  const etapa = isEtapaComercial(filters?.etapa) ? filters.etapa : null;
  const resultadoRaw = filters?.resultado?.trim() || "";
  const gestionMode = !resultadoRaw || resultadoRaw === "Todos"
    ? "all"
    : resultadoRaw === "En curso"
      ? "open"
      : "exact";
  const gestionExact = gestionMode === "exact" ? resultadoRaw : null;
  const term = filters?.search?.trim() || null;
  const pattern = term ? `%${term}%` : null;
  const contact =
    filters?.contact && filters.contact !== "Todos" ? filters.contact : null;

  const [allRow] = await sql`
    SELECT COUNT(*)::int AS total FROM leads
    WHERE (${ownerId}::int IS NULL OR owner_id = ${ownerId})
  `;
  const unfilteredTotal = (allRow as { total: number })?.total ?? 0;

  const [countRow] = await sql`
    SELECT COUNT(*)::int AS total FROM leads
    WHERE (${ownerId}::int IS NULL OR owner_id = ${ownerId})
      AND (${status}::text IS NULL OR lead_status = ${status})
      AND (${etapa}::text IS NULL OR etapa_comercial = ${etapa})
      AND (
        ${gestionMode} = 'all'
        OR (
          ${gestionMode} = 'open'
          AND (
            resultado_gestion IS NULL
            OR resultado_gestion IN ('Interesado', 'En seguimiento')
          )
        )
        OR (${gestionMode} = 'exact' AND resultado_gestion = ${gestionExact})
      )
      AND (
        ${pattern}::text IS NULL
        OR nombre ILIKE ${pattern}
        OR empresa ILIKE ${pattern}
        OR cargo ILIKE ${pattern}
        OR telefono ILIKE ${pattern}
        OR telefono_e164 ILIKE ${pattern}
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
    SELECT leads.*, users.email AS owner_email
    FROM leads
    LEFT JOIN users ON users.id = leads.owner_id
    WHERE (${ownerId}::int IS NULL OR leads.owner_id = ${ownerId})
      AND (${status}::text IS NULL OR lead_status = ${status})
      AND (${etapa}::text IS NULL OR leads.etapa_comercial = ${etapa})
      AND (
        ${gestionMode} = 'all'
        OR (
          ${gestionMode} = 'open'
          AND (
            resultado_gestion IS NULL
            OR resultado_gestion IN ('Interesado', 'En seguimiento')
          )
        )
        OR (${gestionMode} = 'exact' AND resultado_gestion = ${gestionExact})
      )
      AND (
        ${pattern}::text IS NULL
        OR nombre ILIKE ${pattern}
        OR empresa ILIKE ${pattern}
        OR cargo ILIKE ${pattern}
        OR telefono ILIKE ${pattern}
        OR telefono_e164 ILIKE ${pattern}
      )
      AND (
        ${contact}::text IS NULL
        OR (${contact} = 'Con teléfono' AND telefono IS NOT NULL AND telefono <> '')
        OR (${contact} = 'Sin teléfono' AND (telefono IS NULL OR telefono = ''))
        OR (${contact} = 'Con email' AND leads.email IS NOT NULL AND leads.email <> '')
        OR (${contact} = 'Sin email' AND (leads.email IS NULL OR leads.email = ''))
      )
    ORDER BY leads.created_at ASC, leads.id ASC
    LIMIT ${perPage}
    OFFSET ${offset}
  `) as Lead[];

  return { leads, total, unfilteredTotal, page, perPage, totalPages };
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
  fuente: string,
  ownerId: number
) {
  const sql = getSql();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const lead of leads) {
    const email = lead.email?.trim() || null;
    const telefonoE164 = toE164(lead.telefono, lead.pais);
    const telefono = telefonoE164 || lead.telefono?.trim() || null;
    if (!telefono) {
      skipped++;
      continue;
    }

    // En re-guardados desde prospección se conservan lead_status, notas, whatsapp_status y created_at.
    const rows = await sql`
      INSERT INTO leads (
        apollo_id, nombre, cargo, empresa, email, telefono, telefono_e164,
        pais, linkedin_url, lead_status, fuente_busqueda, owner_id, created_at, updated_at
      ) VALUES (
        ${lead.apollo_id}, ${lead.nombre}, ${lead.cargo}, ${lead.empresa},
        ${email}, ${telefono}, ${telefonoE164}, ${lead.pais}, ${lead.linkedin_url},
        'Nuevo', ${fuente}, ${ownerId}, NOW(), NOW()
      )
      ON CONFLICT (owner_id, apollo_id) DO UPDATE SET
        nombre = EXCLUDED.nombre,
        cargo = EXCLUDED.cargo,
        empresa = EXCLUDED.empresa,
        email = COALESCE(NULLIF(EXCLUDED.email, ''), leads.email),
        telefono = EXCLUDED.telefono,
        telefono_e164 = EXCLUDED.telefono_e164,
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

export async function getStats(ownerId: number | null = null) {
  const sql = getSql();
  const [row] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE lead_status = 'Nuevo')::int AS nuevo,
      COUNT(*) FILTER (WHERE lead_status = 'En revisión')::int AS en_revision,
      COUNT(*) FILTER (WHERE resultado_gestion = 'Interesado')::int AS interesado,
      COUNT(*) FILTER (WHERE resultado_gestion = 'En seguimiento')::int AS en_seguimiento,
      COUNT(*) FILTER (WHERE resultado_gestion = 'No interesado')::int AS no_interesado,
      COUNT(*) FILTER (WHERE resultado_gestion = 'No contesta')::int AS no_contesta,
      COUNT(*) FILTER (WHERE telefono IS NOT NULL AND telefono != '')::int AS with_phone,
      COUNT(*) FILTER (WHERE email IS NOT NULL AND email != '')::int AS with_email,
      COUNT(DISTINCT LOWER(BTRIM(empresa))) FILTER (
        WHERE etapa_comercial = 'Calificado' AND empresa IS NOT NULL AND BTRIM(empresa) <> ''
      )::int AS empresas_calificadas,
      COUNT(DISTINCT LOWER(BTRIM(empresa))) FILTER (
        WHERE etapa_comercial = 'Oportunidad' AND empresa IS NOT NULL AND BTRIM(empresa) <> ''
      )::int AS empresas_oportunidad,
      COUNT(DISTINCT LOWER(BTRIM(empresa))) FILTER (
        WHERE etapa_comercial = 'Cliente' AND empresa IS NOT NULL AND BTRIM(empresa) <> ''
      )::int AS empresas_cliente
    FROM leads
    WHERE (${ownerId}::int IS NULL OR owner_id = ${ownerId})
  `;
  const r = row as {
    total: number;
    nuevo: number;
    en_revision: number;
    interesado: number;
    en_seguimiento: number;
    no_interesado: number;
    no_contesta: number;
    with_phone: number;
    with_email: number;
    empresas_calificadas: number;
    empresas_oportunidad: number;
    empresas_cliente: number;
  };
  const conversations = await getConversationStats(ownerId);
  return {
    total: r?.total ?? 0,
    nuevo: r?.nuevo ?? 0,
    en_revision: r?.en_revision ?? 0,
    interesado: r?.interesado ?? 0,
    en_seguimiento: r?.en_seguimiento ?? 0,
    no_interesado: r?.no_interesado ?? 0,
    no_contesta: r?.no_contesta ?? 0,
    with_phone: r?.with_phone ?? 0,
    with_email: r?.with_email ?? 0,
    /** Empresas distintas por etapa (la etapa es de la empresa, no del contacto). */
    etapas: {
      calificado: r?.empresas_calificadas ?? 0,
      oportunidad: r?.empresas_oportunidad ?? 0,
      cliente: r?.empresas_cliente ?? 0,
    },
    conversations,
  };
}

export async function recordProspeccionCredits(
  credits: number,
  contactos: number,
  source: "search" | "phone_webhook" = "search",
  ownerId?: number | null
) {
  const sql = getSql();
  await sql`
    INSERT INTO apollo_prospeccion_credits (credits, contactos_enriquecidos, source, owner_id)
    VALUES (${Math.max(0, credits)}, ${Math.max(0, contactos)}, ${source}, ${ownerId ?? null})
  `;
}

function budgetKey(userId: number): string {
  return `apollo_monthly_budget:u${userId}`;
}

export async function getStoredApolloMonthlyBudget(userId: number): Promise<number | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT value FROM app_settings WHERE key = ${budgetKey(userId)}
  `) as Array<{ value: string }>;
  return decodeMonthlyBudget(rows[0]?.value);
}

export async function setStoredApolloMonthlyBudget(userId: number, budget: number): Promise<void> {
  const sql = getSql();
  const value = encodeMonthlyBudget(budget);
  const key = budgetKey(userId);
  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${key}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

export async function getApolloProspeccionCredits(ownerId: number | null = null) {
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
    WHERE (${ownerId}::int IS NULL OR owner_id = ${ownerId})
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

export async function updateLeadStatus(
  id: number,
  status: LeadStatus,
  ownerId: number | null = null
): Promise<Lead> {
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
      AND (${ownerId}::int IS NULL OR owner_id = ${ownerId})
    RETURNING *
  `) as Lead[];

  const lead = rows[0];
  if (!lead) {
    throw new Error("Contacto no encontrado");
  }
  return lead;
}

export async function updateLeadResultado(
  id: number,
  resultado: GestionResultado | null,
  ownerId: number | null = null
): Promise<Lead> {
  if (resultado !== null && !isGestionResultado(resultado)) {
    throw new Error(`Resultado de gestión no válido: ${String(resultado)}`);
  }

  const sql = getSql();
  const leadId = Number(id);
  if (!Number.isFinite(leadId) || leadId <= 0) {
    throw new Error("ID de contacto no válido");
  }

  const rows = (await sql`
    UPDATE leads
    SET resultado_gestion = ${resultado},
        lead_status = CASE
          WHEN ${resultado}::text IS NOT NULL AND lead_status = 'Nuevo' THEN 'En revisión'
          ELSE lead_status
        END,
        updated_at = NOW()
    WHERE id = ${leadId}
      AND (${ownerId}::int IS NULL OR owner_id = ${ownerId})
    RETURNING *
  `) as Lead[];

  const lead = rows[0];
  if (!lead) throw new Error("Contacto no encontrado");
  return lead;
}

export async function getCompanyFicha(
  leadId: number,
  ownerId: number | null,
  actorId: number
): Promise<{ contacts: Lead[]; colleagues: string[] } | null> {
  const sql = getSql();
  const id = Number(leadId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const opened = (await sql`
    SELECT leads.*, users.email AS owner_email
    FROM leads
    LEFT JOIN users ON users.id = leads.owner_id
    WHERE leads.id = ${id}
      AND (${ownerId}::int IS NULL OR leads.owner_id = ${ownerId})
    LIMIT 1
  `) as Lead[];
  const lead = opened[0];
  if (!lead) return null;

  const empresa = lead.empresa?.trim() ?? "";
  if (!empresa) return { contacts: [lead], colleagues: [] };

  const contacts = (await sql`
    SELECT leads.*, users.email AS owner_email
    FROM leads
    LEFT JOIN users ON users.id = leads.owner_id
    WHERE (${ownerId}::int IS NULL OR leads.owner_id = ${ownerId})
      AND LOWER(REGEXP_REPLACE(BTRIM(COALESCE(leads.empresa, '')), '\\s+', ' ', 'g'))
        = LOWER(REGEXP_REPLACE(BTRIM(${empresa}), '\\s+', ' ', 'g'))
    ORDER BY leads.created_at ASC, leads.id ASC
  `) as Lead[];

  const colleagueRows = (await sql`
    SELECT DISTINCT users.email AS email
    FROM leads
    JOIN users ON users.id = leads.owner_id
    WHERE leads.owner_id IS DISTINCT FROM ${actorId}
      AND users.email IS NOT NULL
      AND LOWER(REGEXP_REPLACE(BTRIM(COALESCE(leads.empresa, '')), '\\s+', ' ', 'g'))
        = LOWER(REGEXP_REPLACE(BTRIM(${empresa}), '\\s+', ' ', 'g'))
    ORDER BY users.email ASC
  `) as Array<{ email: string }>;

  return {
    contacts: contacts.length ? contacts : [lead],
    colleagues: colleagueRows.map((row) => row.email).filter(Boolean),
  };
}

/**
 * Cambia la etapa comercial de la EMPRESA del contacto: aplica a todos los
 * contactos con la misma razón social del mismo dueño. El admin actúa sobre
 * los contactos del dueño del registro abierto, nunca sobre otros vendedores.
 */
export async function updateCompanyEtapa(
  leadId: number,
  etapa: EtapaComercial,
  ownerId: number | null = null
): Promise<Lead[]> {
  if (!isEtapaComercial(etapa)) {
    throw new Error(`Etapa comercial no válida: ${String(etapa)}`);
  }
  const sql = getSql();
  const id = Number(leadId);
  if (!Number.isFinite(id) || id <= 0) throw new Error("ID de contacto no válido");

  const opened = (await sql`
    SELECT id, owner_id, empresa FROM leads
    WHERE id = ${id}
      AND (${ownerId}::int IS NULL OR owner_id = ${ownerId})
    LIMIT 1
  `) as Array<{ id: number; owner_id: number | null; empresa: string | null }>;
  const lead = opened[0];
  if (!lead) throw new Error("Contacto no encontrado");

  const empresa = lead.empresa?.trim() ?? "";
  const scopeOwner = lead.owner_id;

  const rows = (await sql`
    UPDATE leads
    SET etapa_comercial = ${etapa}, updated_at = NOW()
    WHERE (
        id = ${id}
        OR (
          ${empresa} <> ''
          AND owner_id IS NOT DISTINCT FROM ${scopeOwner}
          AND LOWER(REGEXP_REPLACE(BTRIM(COALESCE(empresa, '')), '\\s+', ' ', 'g'))
            = LOWER(REGEXP_REPLACE(BTRIM(${empresa}), '\\s+', ' ', 'g'))
        )
      )
    RETURNING *
  `) as Lead[];
  return rows;
}

/** Guarda un mensaje generado por la IA. Solo trazabilidad: nada se envía. */
export async function insertGeneratedMessage(input: {
  leadId: number;
  ownerId: number;
  channel: MessageChannel;
  headline: string;
  content: unknown;
  leadStatus: string | null;
  resultadoGestion: string | null;
  etapaComercial: string | null;
  source: string;
  model: string | null;
}): Promise<GeneratedMessageSummary> {
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO generated_messages (
      lead_id, owner_id, channel, headline, content, lead_status, resultado_gestion,
      etapa_comercial, source, model, created_at
    ) VALUES (
      ${input.leadId}, ${input.ownerId}, ${input.channel}, ${input.headline.slice(0, 200)},
      ${JSON.stringify(input.content)}::jsonb, ${input.leadStatus}, ${input.resultadoGestion},
      ${input.etapaComercial}, ${input.source}, ${input.model}, NOW()
    )
    RETURNING id, lead_id, channel, headline, lead_status, resultado_gestion, etapa_comercial,
              source, used_at, created_at
  `) as GeneratedMessageSummary[];
  return rows[0];
}

/** Marca que el vendedor copió/usó el mensaje. No implica envío. */
export async function markGeneratedMessageUsed(
  id: number,
  ownerId: number | null
): Promise<GeneratedMessageSummary | null> {
  const sql = getSql();
  const rows = (await sql`
    UPDATE generated_messages
    SET used_at = COALESCE(used_at, NOW())
    WHERE id = ${id}
      AND (${ownerId}::int IS NULL OR owner_id = ${ownerId})
    RETURNING id, lead_id, channel, headline, lead_status, resultado_gestion, etapa_comercial,
              source, used_at, created_at
  `) as GeneratedMessageSummary[];
  return rows[0] ?? null;
}

/** Últimos mensajes generados para un contacto (los más recientes primero). */
export async function listGeneratedMessages(
  leadId: number,
  ownerId: number | null,
  limit = 5
): Promise<GeneratedMessageSummary[]> {
  const sql = getSql();
  return (await sql`
    SELECT id, lead_id, channel, headline, lead_status, resultado_gestion, etapa_comercial,
           source, used_at, created_at
    FROM generated_messages
    WHERE lead_id = ${leadId}
      AND (${ownerId}::int IS NULL OR owner_id = ${ownerId})
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as GeneratedMessageSummary[];
}

export async function updateLeadNotes(
  id: number,
  notas: string,
  ownerId: number | null = null
): Promise<Lead> {
  const sql = getSql();
  const leadId = Number(id);
  if (!Number.isFinite(leadId) || leadId <= 0) {
    throw new Error("ID de contacto no válido");
  }

  const rows = (await sql`
    UPDATE leads SET notas = ${notas}, updated_at = NOW()
    WHERE id = ${leadId}
      AND (${ownerId}::int IS NULL OR owner_id = ${ownerId})
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
  const normalized = toE164(telefono) || telefono.trim();
  await sql`
    INSERT INTO apollo_phone_cache (apollo_id, telefono, requested_at, updated_at)
    VALUES (${apolloId}, ${normalized}, NOW(), NOW())
    ON CONFLICT (apollo_id) DO UPDATE
    SET telefono = EXCLUDED.telefono, updated_at = NOW()
  `;
}

export type PhoneCacheState = {
  telefono: string | null;
  requestedAt: string | null;
};

export async function getPhoneCacheState(
  apolloIds: string[]
): Promise<Map<string, PhoneCacheState>> {
  const map = new Map<string, PhoneCacheState>();
  if (!apolloIds.length) return map;

  const sql = getSql();
  const rows = (await sql`
    SELECT apollo_id, telefono, requested_at FROM apollo_phone_cache
    WHERE apollo_id = ANY(${apolloIds})
  `) as Array<{
    apollo_id: string;
    telefono: string | null;
    requested_at: string | Date | null;
  }>;

  for (const row of rows) {
    const phone = row.telefono?.trim() || null;
    map.set(row.apollo_id, {
      telefono: phone,
      requestedAt: row.requested_at ? new Date(row.requested_at).toISOString() : null,
    });
  }
  return map;
}

export async function markPhoneRequested(apolloIds: string[]) {
  const unique = [...new Set(apolloIds.filter(Boolean))];
  if (!unique.length) return;

  const sql = getSql();
  for (const id of unique) {
    await sql`
      INSERT INTO apollo_phone_cache (apollo_id, telefono, requested_at, updated_at)
      VALUES (${id}, '', NOW(), NOW())
      ON CONFLICT (apollo_id) DO UPDATE
      SET requested_at = NOW(), updated_at = NOW()
      WHERE apollo_phone_cache.telefono IS NULL OR apollo_phone_cache.telefono = ''
    `;
  }
}

/** Diagnóstico: ¿está llegando el webhook de teléfonos de Apollo? */
export async function getPhoneWebhookHealth(): Promise<{
  cache_rows: number;
  last_cache_at: string | null;
  last_webhook_at: string | null;
  webhook_events_24h: number;
}> {
  const sql = getSql();
  const [cache] = (await sql`
    SELECT COUNT(*)::int AS rows, MAX(updated_at) AS last_at FROM apollo_phone_cache
  `) as Array<{ rows: number; last_at: string | Date | null }>;
  const [hook] = (await sql`
    SELECT
      MAX(created_at) AS last_at,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS recent
    FROM apollo_prospeccion_credits
    WHERE source = 'phone_webhook'
  `) as Array<{ last_at: string | Date | null; recent: number }>;
  const iso = (v: string | Date | null) => (v ? new Date(v).toISOString() : null);
  return {
    cache_rows: cache?.rows ?? 0,
    last_cache_at: iso(cache?.last_at ?? null),
    last_webhook_at: iso(hook?.last_at ?? null),
    webhook_events_24h: hook?.recent ?? 0,
  };
}

export async function getPhoneCache(apolloIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const states = await getPhoneCacheState(apolloIds);
  for (const [id, state] of states) {
    if (state.telefono) map.set(id, state.telefono);
  }
  return map;
}

export async function getConversationStats(ownerId: number | null = null): Promise<ConversationStats> {
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
    WHERE (${ownerId}::int IS NULL OR owner_id = ${ownerId})
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
  search?: string,
  ownerId: number | null = null
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
    AND (${ownerId}::int IS NULL OR l.owner_id = ${ownerId})
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

export async function getLeadByApolloId(
  apolloId: string,
  ownerId: number | null = null
): Promise<Lead | null> {
  const id = String(apolloId ?? "").trim();
  if (!id) return null;
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM leads
    WHERE apollo_id = ${id}
      AND (${ownerId}::int IS NULL OR owner_id = ${ownerId})
    ORDER BY updated_at DESC
    LIMIT 1
  `) as Lead[];
  return rows[0] ?? null;
}

export async function getLeadById(id: number, ownerId: number | null = null): Promise<Lead | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM leads
    WHERE id = ${id}
      AND (${ownerId}::int IS NULL OR owner_id = ${ownerId})
  `) as Lead[];
  return rows[0] ?? null;
}

export async function latestOwnerForApollo(apolloId: string): Promise<number | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT owner_id FROM leads
    WHERE apollo_id = ${apolloId} AND owner_id IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 1
  `) as Array<{ owner_id: number }>;
  return rows[0]?.owner_id ?? null;
}

export async function listLeadsByPhone(telefono: string): Promise<Lead[]> {
  const candidates = phoneMatchCandidates(telefono);
  if (!candidates.length) return [];

  const sql = getSql();
  return (await sql`
    SELECT * FROM leads
    WHERE telefono_e164 = ANY(${candidates})
       OR telefono = ANY(${candidates})
       OR regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g') = ANY(${candidates})
    ORDER BY updated_at DESC
  `) as Lead[];
}

export async function getLeadByPhone(telefono: string): Promise<Lead | null> {
  const rows = await listLeadsByPhone(telefono);
  return rows[0] ?? null;
}

/**
 * Cuenta un intento dentro de la ventana. Si la ventana sigue abierta y ya llegó al tope,
 * no suma otro golpe: el llamador debe rechazar la petición.
 */
export async function consumeRateWindow(
  key: string,
  max: number,
  windowMs: number
): Promise<{ limited: boolean; retrySec: number }> {
  const sql = getSql();
  const resetAt = new Date(Date.now() + windowMs);
  const rows = (await sql`
    WITH previous AS (
      SELECT hit_count, reset_at
      FROM api_rate_windows
      WHERE bucket_key = ${key}
    ),
    upsert AS (
      INSERT INTO api_rate_windows (bucket_key, hit_count, reset_at)
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT (bucket_key) DO UPDATE SET
        hit_count = CASE
          WHEN api_rate_windows.reset_at <= NOW() THEN 1
          WHEN api_rate_windows.hit_count >= ${max} THEN api_rate_windows.hit_count
          ELSE api_rate_windows.hit_count + 1
        END,
        reset_at = CASE
          WHEN api_rate_windows.reset_at <= NOW() THEN EXCLUDED.reset_at
          ELSE api_rate_windows.reset_at
        END
      RETURNING hit_count, reset_at
    )
    SELECT
      upsert.reset_at,
      CASE
        WHEN previous.reset_at IS NOT NULL
         AND previous.reset_at > NOW()
         AND previous.hit_count >= ${max}
        THEN TRUE
        ELSE FALSE
      END AS limited
    FROM upsert
    LEFT JOIN previous ON TRUE
  `) as Array<{ reset_at: string; limited: boolean | string }>;
  const row = rows[0];
  const flag = String(row?.limited ?? "");
  if (flag !== "true" && flag !== "t") return { limited: false, retrySec: 0 };
  const retrySec = Math.max(1, Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000));
  return { limited: true, retrySec };
}

export async function clearRateWindow(key: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM api_rate_windows WHERE bucket_key = ${key}`;
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
  const storedPhone = toE164(telefono) || telefono.trim();
  const rows = (await sql`
    INSERT INTO whatsapp_messages (lead_id, telefono, direction, content)
    VALUES (${leadId}, ${storedPhone}, ${direction}, ${content})
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
