import type { ApolloPerson } from "./types";
import { getPhoneCache, savePhoneCache } from "./db";

const BASE_URL =
  process.env.APOLLO_BASE_URL ?? "https://api.apollo.io/api/v1";
const BULK_MATCH_URL = `${BASE_URL}/people/bulk_match`;
const BULK_BATCH = 10;
const PHONE_POLL_MS = 2000;
const PHONE_POLL_MAX_MS = 40000;

function apiHeaders() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error("APOLLO_API_KEY no configurada");
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "x-api-key": key,
  };
}

function webhookBaseUrl(): string | null {
  const explicit = process.env.APOLLO_WEBHOOK_BASE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return null;
}

export function extractEmail(raw: Record<string, unknown>): string | null {
  const email = raw.email;
  if (typeof email === "string" && email.trim()) return email.trim();
  const contactEmails = raw.contact_emails as Array<{ email?: string }> | undefined;
  if (contactEmails?.length) {
    const first = contactEmails.find((e) => e.email?.trim());
    if (first?.email) return first.email.trim();
  }
  return null;
}

export function extractPhone(raw: Record<string, unknown>): string | null {
  const numbers = raw.phone_numbers as Array<Record<string, string>> | undefined;
  if (numbers?.length) {
    for (const n of numbers) {
      const phone = n.sanitized_number ?? n.raw_number;
      if (phone?.trim()) return phone.trim();
    }
  }
  const sanitized = raw.sanitized_phone;
  if (typeof sanitized === "string" && sanitized.trim()) return sanitized.trim();
  const phone = raw.phone;
  if (typeof phone === "string" && phone.trim()) return phone.trim();
  return null;
}

export function buildDisplayName(raw: Record<string, unknown>): string {
  if (typeof raw.name === "string" && raw.name.trim()) return raw.name.trim();
  const first = (raw.first_name as string) ?? "";
  const last =
    (raw.last_name as string) ?? (raw.last_name_obfuscated as string) ?? "";
  return `${first} ${last}`.trim() || "Sin nombre";
}

export function normalizePerson(raw: Record<string, unknown>): ApolloPerson {
  const org = (raw.organization as Record<string, string>) ?? {};
  return {
    apollo_id: String(raw.id ?? raw.person_id ?? ""),
    nombre: buildDisplayName(raw),
    cargo: (raw.title as string) ?? (raw.headline as string) ?? null,
    empresa: org.name ?? null,
    email: extractEmail(raw),
    telefono: extractPhone(raw),
    pais: (raw.country as string) ?? (raw.present_raw_address as string) ?? null,
    linkedin_url: (raw.linkedin_url as string) ?? null,
  };
}

export function isContactableInSearch(raw: Record<string, unknown>): boolean {
  if (raw.has_email !== true) return false;
  const phoneFlag = raw.has_direct_phone;
  if (phoneFlag === true) return true;
  if (typeof phoneFlag === "string") {
    const lower = phoneFlag.toLowerCase();
    return lower.startsWith("yes") || lower.includes("maybe");
  }
  return false;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bulkMatch(
  ids: string[],
  options: { revealPhone: boolean }
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  if (!ids.length) return map;

  const url = new URL(BULK_MATCH_URL);
  url.searchParams.set("reveal_personal_emails", "false");

  if (options.revealPhone) {
    const base = webhookBaseUrl();
    if (!base) {
      throw new Error(
        "No se puede revelar teléfono móvil sin URL pública del webhook (VERCEL_URL)."
      );
    }
    url.searchParams.set("reveal_phone_number", "true");
    url.searchParams.set(
      "webhook_url",
      `${base}/api/apollo/phone-webhook`
    );
  } else {
    url.searchParams.set("reveal_phone_number", "false");
  }

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      details: ids.map((id) => ({ id })),
    }),
  });

  if (!res.ok) {
    throw new Error(`Apollo enrichment ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const matches = (data.matches ?? data.people ?? []) as Record<string, unknown>[];

  for (const match of matches) {
    const id = String(match.id ?? "");
    if (id) map.set(id, match);
  }

  return map;
}

async function pollPhones(ids: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const pending = new Set(ids);
  const started = Date.now();

  while (pending.size > 0 && Date.now() - started < PHONE_POLL_MAX_MS) {
    await sleep(PHONE_POLL_MS);
    const cached = await getPhoneCache([...pending]);
    for (const [id, phone] of cached) {
      found.set(id, phone);
      pending.delete(id);
    }
  }

  return found;
}

export async function enrichPeopleWithContacts(
  rawPeople: Record<string, unknown>[]
): Promise<ApolloPerson[]> {
  const candidates = rawPeople.filter(isContactableInSearch);
  const ids = candidates
    .map((p) => String(p.id ?? ""))
    .filter(Boolean);

  const enrichedMap = new Map<string, Record<string, unknown>>();

  for (const batch of chunk(ids, BULK_BATCH)) {
    const sync = await bulkMatch(batch, { revealPhone: false });
    for (const [id, person] of sync) enrichedMap.set(id, person);
  }

  const missingPhone = ids.filter((id) => {
    const person = enrichedMap.get(id);
    return person && !extractPhone(person);
  });

  if (missingPhone.length) {
    for (const batch of chunk(missingPhone, BULK_BATCH)) {
      await bulkMatch(batch, { revealPhone: true });
    }
    const polled = await pollPhones(missingPhone);
    for (const [id, phone] of polled) {
      const person = enrichedMap.get(id) ?? { id };
      enrichedMap.set(id, { ...person, sanitized_phone: phone });
    }
  }

  const results: ApolloPerson[] = [];
  for (const raw of candidates) {
    const id = String(raw.id ?? "");
    const merged = enrichedMap.get(id) ?? raw;
    const person = normalizePerson(merged);
    if (person.email && person.telefono) {
      results.push(person);
    }
  }

  return results;
}

/** Parsea payload del webhook de teléfonos Apollo. */
export function parsePhoneWebhookPayload(body: unknown): Array<{ apollo_id: string; telefono: string }> {
  const out: Array<{ apollo_id: string; telefono: string }> = [];
  if (!body || typeof body !== "object") return out;

  const people = (body as { people?: unknown[] }).people ?? [];
  for (const entry of people) {
    if (!entry || typeof entry !== "object") continue;
    const id = String((entry as { id?: string }).id ?? "");
    if (!id) continue;
    const phone = extractPhone(entry as Record<string, unknown>);
    if (phone) out.push({ apollo_id: id, telefono: phone });
  }
  return out;
}

export async function persistPhoneWebhook(body: unknown) {
  const rows = parsePhoneWebhookPayload(body);
  for (const row of rows) {
    await savePhoneCache(row.apollo_id, row.telefono);
  }
  return rows.length;
}
