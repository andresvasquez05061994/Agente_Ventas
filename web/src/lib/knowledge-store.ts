import { IAC_COMPANY_PROFILE, type IACSolution } from "./iac-portfolio-knowledge";
import { getSql } from "./db";
import type { KnowledgeKind, StructuredKnowledge } from "./knowledge-extract";

export type KnowledgeProfile = {
  name: string;
  tagline: string;
  experience: string;
  scale: string;
  sectors: string;
  consultant: string;
  consultant_role: string;
  email: string;
  phone: string;
  web: string;
  notes: string;
  updated_at: string | null;
};

export type KnowledgeDocument = {
  id: number;
  filename: string;
  mime: string | null;
  kind: KnowledgeKind;
  summary: string;
  char_count: number;
  active: boolean;
  services_count: number;
  /** Versión declarada por el usuario (ej. «v3», «2026-Q1»). Vacía si no se indicó. */
  version: string;
  /** Fecha ISO (YYYY-MM-DD) hasta la que el contenido se considera vigente. */
  valid_until: string | null;
  /** true si valid_until ya pasó: el Mensaje IA deja de usarlo aunque esté activo. */
  expired: boolean;
  created_at: string;
  updated_at: string;
};

export type KnowledgeDocumentMeta = {
  version?: string;
  valid_until?: string | null;
};

const MAX_VERSION_CHARS = 40;

function isoDateOnly(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  const text = String(value).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/** Normaliza los metadatos del documento. Lanza error si la fecha no es válida. */
export function normalizeDocumentMeta(input: KnowledgeDocumentMeta): {
  version: string;
  valid_until: string | null;
} {
  const version = String(input.version ?? "").trim().slice(0, MAX_VERSION_CHARS);
  const rawDate = input.valid_until == null ? "" : String(input.valid_until).trim();
  if (!rawDate) return { version, valid_until: null };
  const iso = isoDateOnly(rawDate);
  if (!iso || Number.isNaN(new Date(`${iso}T00:00:00Z`).getTime())) {
    throw new Error("La fecha de vigencia debe tener formato AAAA-MM-DD.");
  }
  return { version, valid_until: iso };
}

/** Un documento vence al final del día indicado (UTC). */
export function isDocumentExpired(validUntil: string | null, now = new Date()): boolean {
  if (!validUntil) return false;
  const limit = new Date(`${validUntil}T23:59:59Z`).getTime();
  return Number.isFinite(limit) && limit < now.getTime();
}

/** Etiqueta de fuente para prompts: nombre + versión + vigencia. */
export function documentSourceLabel(doc: Pick<KnowledgeDocument, "filename" | "version" | "valid_until">): string {
  const parts = [doc.filename];
  if (doc.version) parts.push(doc.version);
  if (doc.valid_until) parts.push(`vigente hasta ${doc.valid_until}`);
  return parts.join(" · ");
}

export type KnowledgeDocumentRecord = KnowledgeDocument & {
  extracted_text: string;
  structured: StructuredKnowledge | null;
};

const DEFAULT_PROFILE: KnowledgeProfile = {
  name: IAC_COMPANY_PROFILE.name,
  tagline: IAC_COMPANY_PROFILE.tagline,
  experience: IAC_COMPANY_PROFILE.experience,
  scale: IAC_COMPANY_PROFILE.scale,
  sectors: IAC_COMPANY_PROFILE.sectors.join(", "),
  consultant: IAC_COMPANY_PROFILE.contact.consultant,
  consultant_role: IAC_COMPANY_PROFILE.contact.role,
  email: IAC_COMPANY_PROFILE.contact.email,
  phone: IAC_COMPANY_PROFILE.contact.phone,
  web: IAC_COMPANY_PROFILE.contact.web,
  notes: "",
  updated_at: null,
};

function mapProfile(row: Record<string, unknown> | undefined): KnowledgeProfile {
  if (!row) return { ...DEFAULT_PROFILE };
  return {
    name: String(row.name ?? DEFAULT_PROFILE.name),
    tagline: String(row.tagline ?? DEFAULT_PROFILE.tagline),
    experience: String(row.experience ?? DEFAULT_PROFILE.experience),
    scale: String(row.scale ?? DEFAULT_PROFILE.scale),
    sectors: String(row.sectors ?? DEFAULT_PROFILE.sectors),
    consultant: String(row.consultant ?? DEFAULT_PROFILE.consultant),
    consultant_role: String(row.consultant_role ?? DEFAULT_PROFILE.consultant_role),
    email: String(row.email ?? DEFAULT_PROFILE.email),
    phone: String(row.phone ?? DEFAULT_PROFILE.phone),
    web: String(row.web ?? DEFAULT_PROFILE.web),
    notes: String(row.notes ?? ""),
    updated_at: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
  };
}

function servicesCount(structured: unknown): number {
  if (!structured || typeof structured !== "object") return 0;
  const services = (structured as StructuredKnowledge).services;
  return Array.isArray(services) ? services.length : 0;
}

function mapDocument(row: Record<string, unknown>, includeText = false): KnowledgeDocumentRecord {
  const structured = (row.structured as StructuredKnowledge | null) ?? null;
  const valid_until = isoDateOnly(row.valid_until);
  return {
    id: Number(row.id),
    filename: String(row.filename),
    mime: row.mime ? String(row.mime) : null,
    kind: String(row.kind) as KnowledgeKind,
    summary: String(row.summary ?? ""),
    char_count: Number(row.char_count ?? 0),
    active: Boolean(row.active),
    services_count: servicesCount(structured),
    version: String(row.version ?? ""),
    valid_until,
    expired: isDocumentExpired(valid_until),
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString(),
    extracted_text: includeText ? String(row.extracted_text ?? "") : "",
    structured,
  };
}

export async function getKnowledgeProfile(ownerId: number): Promise<KnowledgeProfile> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM knowledge_profile WHERE owner_id = ${ownerId} LIMIT 1
  `) as Record<string, unknown>[];
  if (!rows[0]) return { ...DEFAULT_PROFILE };
  return mapProfile(rows[0]);
}

export async function saveKnowledgeProfile(
  ownerId: number,
  input: Omit<KnowledgeProfile, "updated_at">
): Promise<KnowledgeProfile> {
  const sql = getSql();
  const trim = (value: string, max: number) => value.trim().slice(0, max);
  const rows = (await sql`
    INSERT INTO knowledge_profile (
      owner_id, name, tagline, experience, scale, sectors, consultant, consultant_role, email, phone, web, notes, updated_at
    ) VALUES (
      ${ownerId},
      ${trim(input.name, 80)},
      ${trim(input.tagline, 160)},
      ${trim(input.experience, 200)},
      ${trim(input.scale, 160)},
      ${trim(input.sectors, 400)},
      ${trim(input.consultant, 80)},
      ${trim(input.consultant_role, 80)},
      ${trim(input.email, 120)},
      ${trim(input.phone, 40)},
      ${trim(input.web, 120)},
      ${trim(input.notes, 2000)},
      NOW()
    )
    ON CONFLICT (owner_id) DO UPDATE SET
      name = EXCLUDED.name,
      tagline = EXCLUDED.tagline,
      experience = EXCLUDED.experience,
      scale = EXCLUDED.scale,
      sectors = EXCLUDED.sectors,
      consultant = EXCLUDED.consultant,
      consultant_role = EXCLUDED.consultant_role,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      web = EXCLUDED.web,
      notes = EXCLUDED.notes,
      updated_at = NOW()
    RETURNING *
  `) as Record<string, unknown>[];
  return mapProfile(rows[0]);
}

export async function listKnowledgeDocuments(ownerId: number): Promise<KnowledgeDocument[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, filename, mime, kind, summary, structured, char_count, active, version, valid_until,
           created_at, updated_at
    FROM knowledge_documents
    WHERE owner_id = ${ownerId}
    ORDER BY created_at DESC
  `) as Record<string, unknown>[];
  return rows.map((row) => mapDocument(row, false));
}

export async function countKnowledgeDocuments(ownerId: number): Promise<number> {
  const sql = getSql();
  const [row] = (await sql`
    SELECT COUNT(*)::int AS total FROM knowledge_documents WHERE owner_id = ${ownerId}
  `) as Array<{
    total: number;
  }>;
  return row?.total ?? 0;
}

export async function insertKnowledgeDocument(ownerId: number, input: {
  filename: string;
  mime: string | null;
  kind: KnowledgeKind;
  extracted_text: string;
  summary: string;
  structured: StructuredKnowledge | null;
  version?: string;
  valid_until?: string | null;
}): Promise<KnowledgeDocument> {
  const sql = getSql();
  const structuredJson = input.structured ? JSON.stringify(input.structured) : null;
  const meta = normalizeDocumentMeta({ version: input.version, valid_until: input.valid_until });
  const rows = (await sql`
    INSERT INTO knowledge_documents (
      owner_id, filename, mime, kind, extracted_text, summary, structured, char_count, active,
      version, valid_until, created_at, updated_at
    ) VALUES (
      ${ownerId},
      ${input.filename.slice(0, 180)},
      ${input.mime},
      ${input.kind},
      ${input.extracted_text},
      ${input.summary.slice(0, 400)},
      ${structuredJson}::jsonb,
      ${input.extracted_text.length},
      TRUE,
      ${meta.version},
      ${meta.valid_until}::date,
      NOW(),
      NOW()
    )
    RETURNING id, filename, mime, kind, summary, structured, char_count, active, version, valid_until,
              created_at, updated_at
  `) as Record<string, unknown>[];
  return mapDocument(rows[0], false);
}

export async function setKnowledgeDocumentActive(
  id: number,
  active: boolean,
  ownerId: number
): Promise<KnowledgeDocument | null> {
  const sql = getSql();
  const rows = (await sql`
    UPDATE knowledge_documents
    SET active = ${active}, updated_at = NOW()
    WHERE id = ${id} AND owner_id = ${ownerId}
    RETURNING id, filename, mime, kind, summary, structured, char_count, active, version, valid_until,
              created_at, updated_at
  `) as Record<string, unknown>[];
  return rows[0] ? mapDocument(rows[0], false) : null;
}

export async function updateKnowledgeDocumentMeta(
  id: number,
  meta: KnowledgeDocumentMeta,
  ownerId: number
): Promise<KnowledgeDocument | null> {
  const sql = getSql();
  const normalized = normalizeDocumentMeta(meta);
  const rows = (await sql`
    UPDATE knowledge_documents
    SET version = ${normalized.version},
        valid_until = ${normalized.valid_until}::date,
        updated_at = NOW()
    WHERE id = ${id} AND owner_id = ${ownerId}
    RETURNING id, filename, mime, kind, summary, structured, char_count, active, version, valid_until,
              created_at, updated_at
  `) as Record<string, unknown>[];
  return rows[0] ? mapDocument(rows[0], false) : null;
}

export async function deleteKnowledgeDocument(id: number): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM knowledge_documents WHERE id = ${id} RETURNING id
  `) as Array<{ id: number }>;
  return Boolean(rows[0]);
}

/** Documentos activos y vigentes: los vencidos quedan fuera del Mensaje IA aunque sigan activos. */
export async function listActiveKnowledgeDocuments(ownerId: number): Promise<KnowledgeDocumentRecord[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM knowledge_documents
    WHERE active = TRUE AND owner_id = ${ownerId}
    ORDER BY updated_at DESC
  `) as Record<string, unknown>[];
  return rows.map((row) => mapDocument(row, true)).filter((doc) => !doc.expired);
}

export function profileToCompanyShape(profile: KnowledgeProfile) {
  return {
    name: profile.name || IAC_COMPANY_PROFILE.name,
    tagline: profile.tagline || IAC_COMPANY_PROFILE.tagline,
    experience: profile.experience || IAC_COMPANY_PROFILE.experience,
    scale: profile.scale || IAC_COMPANY_PROFILE.scale,
    sectors: profile.sectors
      ? profile.sectors.split(",").map((s) => s.trim()).filter(Boolean)
      : IAC_COMPANY_PROFILE.sectors,
    contact: {
      consultant: profile.consultant || IAC_COMPANY_PROFILE.contact.consultant,
      role: profile.consultant_role || IAC_COMPANY_PROFILE.contact.role,
      email: profile.email || IAC_COMPANY_PROFILE.contact.email,
      phone: profile.phone || IAC_COMPANY_PROFILE.contact.phone,
      web: profile.web || IAC_COMPANY_PROFILE.contact.web,
    },
    notes: profile.notes,
  };
}

export const MAX_BUYER_PERSONAS = 20;

export type BuyerPersona = {
  id: number;
  name: string;
  role: string;
  sector: string;
  characteristics: string;
  value_for_client: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type BuyerPersonaInput = {
  name: string;
  role: string;
  sector: string;
  characteristics: string;
  value_for_client: string;
  active?: boolean;
};

function mapPersona(row: Record<string, unknown>): BuyerPersona {
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    role: String(row.role ?? ""),
    sector: String(row.sector ?? ""),
    characteristics: String(row.characteristics ?? ""),
    value_for_client: String(row.value_for_client ?? ""),
    active: Boolean(row.active),
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString(),
  };
}

function trimPersona(input: BuyerPersonaInput): BuyerPersonaInput {
  return {
    name: input.name.trim().slice(0, 80),
    role: input.role.trim().slice(0, 120),
    sector: input.sector.trim().slice(0, 120),
    characteristics: input.characteristics.trim().slice(0, 600),
    value_for_client: input.value_for_client.trim().slice(0, 500),
    active: input.active !== false,
  };
}

export async function listBuyerPersonas(ownerId: number): Promise<BuyerPersona[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM knowledge_personas WHERE owner_id = ${ownerId} ORDER BY updated_at DESC
  `) as Record<string, unknown>[];
  return rows.map(mapPersona);
}

export async function listActiveBuyerPersonas(ownerId: number): Promise<BuyerPersona[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM knowledge_personas
    WHERE active = TRUE AND owner_id = ${ownerId}
    ORDER BY updated_at DESC
  `) as Record<string, unknown>[];
  return rows.map(mapPersona);
}

export async function countBuyerPersonas(ownerId: number): Promise<number> {
  const sql = getSql();
  const [row] = (await sql`
    SELECT COUNT(*)::int AS total FROM knowledge_personas WHERE owner_id = ${ownerId}
  `) as Array<{
    total: number;
  }>;
  return row?.total ?? 0;
}

export async function insertBuyerPersona(ownerId: number, input: BuyerPersonaInput): Promise<BuyerPersona> {
  const sql = getSql();
  const data = trimPersona(input);
  if (!data.name) throw new Error("Ponle un nombre al buyer persona.");
  const rows = (await sql`
    INSERT INTO knowledge_personas (
      owner_id, name, role, sector, characteristics, value_for_client, active, created_at, updated_at
    ) VALUES (
      ${ownerId},
      ${data.name},
      ${data.role},
      ${data.sector},
      ${data.characteristics},
      ${data.value_for_client},
      ${data.active},
      NOW(),
      NOW()
    )
    RETURNING *
  `) as Record<string, unknown>[];
  return mapPersona(rows[0]);
}

export async function updateBuyerPersona(
  id: number,
  input: BuyerPersonaInput,
  ownerId: number
): Promise<BuyerPersona | null> {
  const sql = getSql();
  const data = trimPersona(input);
  if (!data.name) throw new Error("Ponle un nombre al buyer persona.");
  const rows = (await sql`
    UPDATE knowledge_personas SET
      name = ${data.name},
      role = ${data.role},
      sector = ${data.sector},
      characteristics = ${data.characteristics},
      value_for_client = ${data.value_for_client},
      active = ${data.active},
      updated_at = NOW()
    WHERE id = ${id} AND owner_id = ${ownerId}
    RETURNING *
  `) as Record<string, unknown>[];
  return rows[0] ? mapPersona(rows[0]) : null;
}

export async function deleteBuyerPersona(id: number): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM knowledge_personas WHERE id = ${id} RETURNING id
  `) as Array<{ id: number }>;
  return Boolean(rows[0]);
}

/** Servicios extraídos de documentos vigentes; cada uno lleva su fuente (archivo, versión, vigencia). */
export function collectDocumentServices(docs: KnowledgeDocumentRecord[]): IACSolution[] {
  const seen = new Set<string>();
  const out: IACSolution[] = [];
  for (const doc of docs) {
    for (const service of doc.structured?.services ?? []) {
      const key = service.name.toLowerCase();
      if (!service.name || seen.has(key)) continue;
      seen.add(key);
      out.push({ ...service, evidence: "documento", source: documentSourceLabel(doc) });
    }
  }
  return out;
}
