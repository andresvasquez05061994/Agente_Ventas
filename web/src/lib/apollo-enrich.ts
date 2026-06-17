import type { ApolloPerson } from "./types";
import { getPhoneCache, savePhoneCache } from "./db";

const BASE_URL =
  process.env.APOLLO_BASE_URL ?? "https://api.apollo.io/api/v1";
const MATCH_URL = `${BASE_URL}/people/match`;
const PHONE_POLL_MS = 1500;
const PHONE_POLL_MAX_MS = 8000;
const MATCH_CONCURRENCY = 5;

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

  const org = raw.organization as Record<string, unknown> | undefined;
  if (org) {
    for (const key of ["phone", "sanitized_phone", "primary_phone"]) {
      const value = org[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function matchPerson(
  id: string,
  options: { revealPhone: boolean }
): Promise<Record<string, unknown> | null> {
  const url = new URL(MATCH_URL);
  url.searchParams.set("id", id);
  url.searchParams.set("reveal_personal_emails", "false");

  if (options.revealPhone) {
    const base = webhookBaseUrl();
    if (!base) return null;
    url.searchParams.set("reveal_phone_number", "true");
    url.searchParams.set("webhook_url", `${base}/api/apollo/phone-webhook`);
  } else {
    url.searchParams.set("reveal_phone_number", "false");
  }

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: apiHeaders(),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const person = data.person as Record<string, unknown> | undefined;
  return person ?? null;
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
  const ids = candidates.map((p) => String(p.id ?? "")).filter(Boolean);
  const enrichedMap = new Map<string, Record<string, unknown>>();

  const usePhoneReveal = Boolean(webhookBaseUrl());
  const matched: Array<{ id: string; person: Record<string, unknown> | null }> = [];
  for (let i = 0; i < ids.length; i += MATCH_CONCURRENCY) {
    const batch = ids.slice(i, i + MATCH_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (id) => ({
        id,
        person: await matchPerson(id, { revealPhone: usePhoneReveal }),
      }))
    );
    matched.push(...batchResults);
  }

  for (const { id, person } of matched) {
    if (person) enrichedMap.set(id, person);
  }

  const missingPhone = ids.filter((id) => {
    const person = enrichedMap.get(id);
    return person && !extractPhone(person);
  });

  if (missingPhone.length && webhookBaseUrl()) {
    for (let i = 0; i < missingPhone.length; i += MATCH_CONCURRENCY) {
      const batch = missingPhone.slice(i, i + MATCH_CONCURRENCY);
      await Promise.all(batch.map((id) => matchPerson(id, { revealPhone: true })));
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

export function parsePhoneWebhookPayload(
  body: unknown
): Array<{ apollo_id: string; telefono: string }> {
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
