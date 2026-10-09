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
  created_at: string;
  updated_at: string;
};

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
  return {
    id: Number(row.id),
    filename: String(row.filename),
    mime: row.mime ? String(row.mime) : null,
    kind: String(row.kind) as KnowledgeKind,
    summary: String(row.summary ?? ""),
    char_count: Number(row.char_count ?? 0),
    active: Boolean(row.active),
    services_count: servicesCount(structured),
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString(),
    extracted_text: includeText ? String(row.extracted_text ?? "") : "",
    structured,
  };
}

export async function getKnowledgeProfile(): Promise<KnowledgeProfile> {
  const sql = getSql();
  const rows = (await sql`SELECT * FROM knowledge_profile WHERE id = 1 LIMIT 1`) as Record<
    string,
    unknown
  >[];
  if (!rows[0]) {
    await sql`
      INSERT INTO knowledge_profile (
        id, name, tagline, experience, scale, sectors, consultant, consultant_role, email, phone, web, notes
      ) VALUES (
        1,
        ${DEFAULT_PROFILE.name},
        ${DEFAULT_PROFILE.tagline},
        ${DEFAULT_PROFILE.experience},
        ${DEFAULT_PROFILE.scale},
        ${DEFAULT_PROFILE.sectors},
        ${DEFAULT_PROFILE.consultant},
        ${DEFAULT_PROFILE.consultant_role},
        ${DEFAULT_PROFILE.email},
        ${DEFAULT_PROFILE.phone},
        ${DEFAULT_PROFILE.web},
        ${DEFAULT_PROFILE.notes}
      )
      ON CONFLICT (id) DO NOTHING
    `;
    return { ...DEFAULT_PROFILE };
  }
  return mapProfile(rows[0]);
}

export async function saveKnowledgeProfile(input: Omit<KnowledgeProfile, "updated_at">): Promise<KnowledgeProfile> {
  const sql = getSql();
  const trim = (value: string, max: number) => value.trim().slice(0, max);
  const rows = (await sql`
    INSERT INTO knowledge_profile (
      id, name, tagline, experience, scale, sectors, consultant, consultant_role, email, phone, web, notes, updated_at
    ) VALUES (
      1,
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
    ON CONFLICT (id) DO UPDATE SET
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

export async function listKnowledgeDocuments(): Promise<KnowledgeDocument[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, filename, mime, kind, summary, structured, char_count, active, created_at, updated_at
    FROM knowledge_documents
    ORDER BY created_at DESC
  `) as Record<string, unknown>[];
  return rows.map((row) => mapDocument(row, false));
}

export async function countKnowledgeDocuments(): Promise<number> {
  const sql = getSql();
  const [row] = (await sql`SELECT COUNT(*)::int AS total FROM knowledge_documents`) as Array<{
    total: number;
  }>;
  return row?.total ?? 0;
}

export async function insertKnowledgeDocument(input: {
  filename: string;
  mime: string | null;
  kind: KnowledgeKind;
  extracted_text: string;
  summary: string;
  structured: StructuredKnowledge | null;
}): Promise<KnowledgeDocument> {
  const sql = getSql();
  const structuredJson = input.structured ? JSON.stringify(input.structured) : null;
  const rows = (await sql`
    INSERT INTO knowledge_documents (
      filename, mime, kind, extracted_text, summary, structured, char_count, active, created_at, updated_at
    ) VALUES (
      ${input.filename.slice(0, 180)},
      ${input.mime},
      ${input.kind},
      ${input.extracted_text},
      ${input.summary.slice(0, 400)},
      ${structuredJson}::jsonb,
      ${input.extracted_text.length},
      TRUE,
      NOW(),
      NOW()
    )
    RETURNING id, filename, mime, kind, summary, structured, char_count, active, created_at, updated_at
  `) as Record<string, unknown>[];
  return mapDocument(rows[0], false);
}

export async function setKnowledgeDocumentActive(id: number, active: boolean): Promise<KnowledgeDocument | null> {
  const sql = getSql();
  const rows = (await sql`
    UPDATE knowledge_documents
    SET active = ${active}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, filename, mime, kind, summary, structured, char_count, active, created_at, updated_at
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

export async function listActiveKnowledgeDocuments(): Promise<KnowledgeDocumentRecord[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM knowledge_documents WHERE active = TRUE ORDER BY updated_at DESC
  `) as Record<string, unknown>[];
  return rows.map((row) => mapDocument(row, true));
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

export function collectDocumentServices(docs: KnowledgeDocumentRecord[]): IACSolution[] {
  const seen = new Set<string>();
  const out: IACSolution[] = [];
  for (const doc of docs) {
    for (const service of doc.structured?.services ?? []) {
      const key = service.name.toLowerCase();
      if (!service.name || seen.has(key)) continue;
      seen.add(key);
      out.push(service);
    }
  }
  return out;
}
