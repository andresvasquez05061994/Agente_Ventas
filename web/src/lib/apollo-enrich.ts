import type { ApolloPerson } from "./types";
import { getPhoneCache, savePhoneCache } from "./db";

const BASE_URL =
  process.env.APOLLO_BASE_URL ?? "https://api.apollo.io/api/v1";
const BULK_MATCH_URL = `${BASE_URL}/people/bulk_match`;
const PHONE_POLL_MS = 1200;
const PHONE_POLL_MAX_MS = 12000;
const BATCH_SIZE = 10;

export interface EnrichOptions {
  maxCandidates?: number;
  targetComplete?: number;
  deadlineMs?: number;
}

function hasTimeLeft(deadlineMs?: number): boolean {
  return !deadlineMs || Date.now() < deadlineMs;
}

function apiHeaders() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error("APOLLO_API_KEY no configurada");
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    accept: "application/json",
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

/** Apollo documenta person_id en api_search; people/match acepta id o person_id. */
export function resolveApolloPersonId(raw: Record<string, unknown>): string {
  const id = raw.person_id ?? raw.id;
  return id ? String(id) : "";
}

export function buildMatchDetail(raw: Record<string, unknown>): Record<string, unknown> | null {
  const id = resolveApolloPersonId(raw);
  if (!id) return null;

  const org = raw.organization as Record<string, unknown> | undefined;
  const detail: Record<string, unknown> = { id };

  if (raw.first_name) detail.first_name = raw.first_name;
  const last = raw.last_name ?? raw.last_name_obfuscated;
  if (last) detail.last_name = last;

  const name = buildDisplayName(raw);
  if (name && name !== "Sin nombre") detail.name = name;
  if (raw.title) detail.title = raw.title;
  if (org?.name) detail.organization_name = org.name;
  if (raw.linkedin_url) detail.linkedin_url = raw.linkedin_url;

  return detail;
}

function candidateScore(raw: Record<string, unknown>): number {
  let score = 0;
  if (raw.has_email === true) score += 100;
  else if (raw.has_email !== false) score += 25;
  if (raw.has_direct_phone === "Yes" || raw.has_direct_phone === true) score += 50;
  return score;
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
    apollo_id: resolveApolloPersonId(raw),
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
  if (!resolveApolloPersonId(raw)) return false;
  // Apollo marca has_email=false cuando no hay email que revelar.
  if (raw.has_email === false) return false;
  return true;
}

export function isApolloWebhookConfigured(): boolean {
  return Boolean(webhookBaseUrl());
}

export interface EnrichStats {
  candidates: number;
  matched: number;
  with_email: number;
  with_phone: number;
  with_both: number;
  credits_consumed: number;
  match_errors: string[];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bulkMatchPeople(
  details: Record<string, unknown>[],
  options: { revealEmail: boolean; revealPhone: boolean },
  retry = 0
): Promise<{
  byId: Map<string, Record<string, unknown>>;
  credits: number;
  error?: string;
}> {
  if (!details.length) return { byId: new Map(), credits: 0 };

  const url = new URL(BULK_MATCH_URL);
  url.searchParams.set("reveal_personal_emails", options.revealEmail ? "true" : "false");
  url.searchParams.set("reveal_phone_number", options.revealPhone ? "true" : "false");

  if (options.revealPhone) {
    const base = webhookBaseUrl();
    if (!base) {
      return { byId: new Map(), credits: 0, error: "Webhook no configurado (APOLLO_WEBHOOK_BASE_URL)" };
    }
    url.searchParams.set("webhook_url", `${base}/api/apollo/phone-webhook`);
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ details: details.slice(0, BATCH_SIZE) }),
    });
  } catch (e) {
    return {
      byId: new Map(),
      credits: 0,
      error: `Error de red al enriquecer: ${e instanceof Error ? e.message : "desconocido"}`,
    };
  }

  if (res.status === 429 && retry < 2) {
    await sleep(1500 * (retry + 1));
    return bulkMatchPeople(details, options, retry + 1);
  }

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 403 && text.toLowerCase().includes("master")) {
      return {
        byId: new Map(),
        credits: 0,
        error: "API key debe ser Master en Apollo → Settings → API",
      };
    }
    return {
      byId: new Map(),
      credits: 0,
      error: `Apollo bulk_match ${res.status}: ${text.slice(0, 280)}`,
    };
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { byId: new Map(), credits: 0, error: "Respuesta inválida de Apollo bulk_match" };
  }

  const credits = Number(data.credits_consumed ?? 0);
  const byId = new Map<string, Record<string, unknown>>();
  const matches = (data.matches ?? []) as Record<string, unknown>[];

  for (const person of matches) {
    const pid = resolveApolloPersonId(person);
    if (pid) byId.set(pid, person);
  }

  return { byId, credits: Number.isFinite(credits) ? credits : 0 };
}

async function pollPhones(ids: string[], maxMs = PHONE_POLL_MAX_MS): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const pending = new Set(ids);
  const started = Date.now();

  while (pending.size > 0 && Date.now() - started < maxMs) {
    await sleep(PHONE_POLL_MS);
    const cached = await getPhoneCache([...pending]);
    for (const [id, phone] of cached) {
      found.set(id, phone);
      pending.delete(id);
    }
  }

  return found;
}

function countCompleteContacts(
  candidates: Record<string, unknown>[],
  enrichedMap: Map<string, Record<string, unknown>>
): number {
  let complete = 0;
  for (const raw of candidates) {
    const id = resolveApolloPersonId(raw);
    const merged = enrichedMap.get(id) ?? raw;
    const person = normalizePerson(merged);
    if (person.email && person.telefono) complete++;
  }
  return complete;
}

export async function enrichPeopleWithContacts(
  rawPeople: Record<string, unknown>[],
  options?: EnrichOptions
): Promise<{ results: ApolloPerson[]; stats: EnrichStats }> {
  const maxCandidates = options?.maxCandidates ?? rawPeople.length;
  const candidates = rawPeople
    .filter(isContactableInSearch)
    .sort((a, b) => candidateScore(b) - candidateScore(a))
    .slice(0, maxCandidates);

  const enrichedMap = new Map<string, Record<string, unknown>>();
  const rawById = new Map<string, Record<string, unknown>>();
  let creditsConsumed = 0;
  let apiMatched = 0;
  const matchErrors: string[] = [];

  for (const raw of candidates) {
    const id = resolveApolloPersonId(raw);
    if (id) rawById.set(id, raw);
  }

  const ids = [...rawById.keys()];
  const cachedPhones = await getPhoneCache(ids);
  for (const [id, phone] of cachedPhones) {
    enrichedMap.set(id, { ...(rawById.get(id) ?? { id }), id, sanitized_phone: phone });
  }

  const details = candidates
    .map(buildMatchDetail)
    .filter((d): d is Record<string, unknown> => d !== null);

  // Fase 1: email (sin teléfono — más fiable y rápido)
  for (let i = 0; i < details.length; i += BATCH_SIZE) {
    if (!hasTimeLeft(options?.deadlineMs)) break;
    const batch = details.slice(i, i + BATCH_SIZE);
    const { byId, credits, error } = await bulkMatchPeople(batch, {
      revealEmail: true,
      revealPhone: false,
    });
    creditsConsumed += credits;
    if (error) matchErrors.push(error);
    for (const [id, person] of byId) {
      enrichedMap.set(id, { ...(rawById.get(id) ?? {}), ...person });
      apiMatched++;
    }
    if (
      options?.targetComplete &&
      countCompleteContacts(candidates, enrichedMap) >= options.targetComplete
    ) {
      break;
    }
  }

  // Fase 2: teléfono solo para quienes ya tienen email
  const needPhone = ids.filter((id) => {
    const merged = enrichedMap.get(id) ?? rawById.get(id);
    return merged && extractEmail(merged) && !extractPhone(merged);
  });

  if (needPhone.length && webhookBaseUrl()) {
    const phoneDetails = needPhone
      .map((id) => buildMatchDetail(enrichedMap.get(id) ?? rawById.get(id)!))
      .filter((d): d is Record<string, unknown> => d !== null);

    for (let i = 0; i < phoneDetails.length; i += BATCH_SIZE) {
      if (!hasTimeLeft(options?.deadlineMs)) break;
      const batch = phoneDetails.slice(i, i + BATCH_SIZE);
      const batchIds = batch
        .map((d) => String(d.id ?? ""))
        .filter(Boolean);
      const { credits, error } = await bulkMatchPeople(batch, {
        revealEmail: false,
        revealPhone: true,
      });
      creditsConsumed += credits;
      if (error) matchErrors.push(error);

      const pollBudget = options?.deadlineMs
        ? Math.max(800, Math.min(PHONE_POLL_MAX_MS, options.deadlineMs - Date.now()))
        : PHONE_POLL_MAX_MS;
      const polled = await pollPhones(batchIds, pollBudget);
      for (const [id, phone] of polled) {
        const person = enrichedMap.get(id) ?? rawById.get(id) ?? { id };
        enrichedMap.set(id, { ...person, sanitized_phone: phone });
      }
      if (
        options?.targetComplete &&
        countCompleteContacts(candidates, enrichedMap) >= options.targetComplete
      ) {
        break;
      }
    }
  } else if (needPhone.length && !webhookBaseUrl()) {
    matchErrors.push("Webhook no configurado para revelar teléfonos móviles");
  }

  const results: ApolloPerson[] = [];
  let withEmail = 0;
  let withPhone = 0;

  for (const raw of candidates) {
    const id = resolveApolloPersonId(raw);
    const merged = enrichedMap.get(id) ?? raw;
    const person = normalizePerson(merged);
    if (person.email) withEmail++;
    if (person.telefono) withPhone++;
    if (person.email && person.telefono) results.push(person);
  }

  return {
    results,
    stats: {
      candidates: candidates.length,
      matched: apiMatched,
      with_email: withEmail,
      with_phone: withPhone,
      with_both: results.length,
      credits_consumed: creditsConsumed,
      match_errors: [...new Set(matchErrors)],
    },
  };
}

export function parsePhoneWebhookPayload(
  body: unknown
): Array<{ apollo_id: string; telefono: string }> {
  const out: Array<{ apollo_id: string; telefono: string }> = [];
  if (!body || typeof body !== "object") return out;

  const people = (body as { people?: unknown[] }).people ?? [];
  for (const entry of people) {
    if (!entry || typeof entry !== "object") continue;
    const id = resolveApolloPersonId(entry as Record<string, unknown>);
    if (!id) continue;
    const phone = extractPhone(entry as Record<string, unknown>);
    if (phone) out.push({ apollo_id: id, telefono: phone });
  }
  return out;
}

export function extractWebhookCredits(body: unknown): number {
  if (!body || typeof body !== "object") return 0;
  const credits = Number((body as { credits_consumed?: number }).credits_consumed ?? 0);
  return Number.isFinite(credits) ? Math.max(0, credits) : 0;
}

export async function persistPhoneWebhook(body: unknown) {
  const rows = parsePhoneWebhookPayload(body);
  for (const row of rows) {
    await savePhoneCache(row.apollo_id, row.telefono);
  }
  return {
    phones_saved: rows.length,
    credits_consumed: extractWebhookCredits(body),
  };
}
