import type { ApolloPerson } from "./types";
import { webhookToken } from "./auth";
import { isPhoneRequestPending } from "./credit-policy";
import { getPhoneCache, getPhoneCacheState, markPhoneRequested, savePhoneCache } from "./db";

const BASE_URL =
  process.env.APOLLO_BASE_URL ?? "https://api.apollo.io/api/v1";
const BULK_MATCH_URL = `${BASE_URL}/people/bulk_match`;
const PHONE_POLL_MS = 1200;
/** Apollo suele entregar el teléfono por webhook entre 10 y 20 s después de pedirlo. */
const PHONE_POLL_MAX_MS = 20000;
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

/**
 * URL pública a la que Apollo envía los teléfonos. La ruta del webhook no usa la
 * sesión del equipo: se autentica con ?token=. La URL por despliegue (VERCEL_URL)
 * a veces está protegida por Vercel y devuelve 401, así que se prefiere el
 * dominio de producción del proyecto.
 */
export function webhookBaseUrl(): string | null {
  const explicit = process.env.APOLLO_WEBHOOK_BASE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;
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

export function apolloPhoneWebhookUrl(): string | null {
  const base = webhookBaseUrl();
  const token = webhookToken("apollo");
  if (!base || !token) return null;
  return `${base}/api/apollo/phone-webhook/${encodeURIComponent(token)}`;
}

export function isApolloWebhookConfigured(): boolean {
  return Boolean(apolloPhoneWebhookUrl());
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
    const hook = apolloPhoneWebhookUrl();
    if (!hook) {
      return { byId: new Map(), credits: 0, error: "Webhook no configurado (APOLLO_WEBHOOK_BASE_URL / AUTH_SECRET)" };
    }
    url.searchParams.set("webhook_url", hook);
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

async function revealPhonesSafely(
  ids: string[],
  detailsById: Map<string, Record<string, unknown>>,
  options?: { deadlineMs?: number }
): Promise<{ phones: Map<string, string>; credits: number; errors: string[] }> {
  const phones = new Map<string, string>();
  const errors: string[] = [];
  let credits = 0;
  if (!ids.length) return { phones, credits, errors };

  const states = await getPhoneCacheState(ids);
  const pending: string[] = [];
  const fresh: string[] = [];

  for (const id of ids) {
    const state = states.get(id);
    if (state?.telefono) {
      phones.set(id, state.telefono);
      continue;
    }
    if (isPhoneRequestPending(state?.requestedAt)) pending.push(id);
    else fresh.push(id);
  }

  if (fresh.length && webhookBaseUrl()) {
    for (let i = 0; i < fresh.length; i += BATCH_SIZE) {
      if (!hasTimeLeft(options?.deadlineMs)) break;
      const batchIds = fresh.slice(i, i + BATCH_SIZE);
      const batch = batchIds
        .map((id) => detailsById.get(id))
        .filter((d): d is Record<string, unknown> => Boolean(d));
      if (!batch.length) continue;

      const { credits: used, error } = await bulkMatchPeople(batch, {
        revealEmail: false,
        revealPhone: true,
      });
      credits += used;
      if (error) errors.push(error);
      if (!error || used > 0) await markPhoneRequested(batchIds);
    }
  } else if (fresh.length && !webhookBaseUrl()) {
    errors.push("Webhook no configurado para revelar teléfonos móviles");
  }

  const waitIds = [...new Set([...fresh, ...pending])].filter((id) => !phones.has(id));
  if (waitIds.length) {
    const pollBudget = options?.deadlineMs
      ? Math.max(800, Math.min(PHONE_POLL_MAX_MS, options.deadlineMs - Date.now()))
      : PHONE_POLL_MAX_MS;
    const polled = await pollPhones(waitIds, pollBudget);
    for (const [id, phone] of polled) phones.set(id, phone);
  }

  return { phones, credits, errors };
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

function emptyEnrichStats(): EnrichStats {
  return {
    candidates: 0,
    matched: 0,
    with_email: 0,
    with_phone: 0,
    with_both: 0,
    credits_consumed: 0,
    match_errors: [],
  };
}

/** Enriquece un solo perfil (email + teléfono). Evita gastar créditos en lotes innecesarios. */
export async function enrichSinglePersonWithContacts(
  raw: Record<string, unknown>,
  options?: { deadlineMs?: number }
): Promise<{ person: ApolloPerson | null; stats: EnrichStats }> {
  if (!isContactableInSearch(raw)) {
    const person = normalizePerson(raw);
    const complete = Boolean(person.email && person.telefono);
    return {
      person: complete ? person : null,
      stats: emptyEnrichStats(),
    };
  }

  const id = resolveApolloPersonId(raw);
  let merged: Record<string, unknown> = { ...raw };
  let creditsConsumed = 0;
  let apiMatched = 0;
  const matchErrors: string[] = [];

  const cachedPhones = await getPhoneCache([id]);
  const cachedPhone = cachedPhones.get(id);
  if (cachedPhone) {
    merged = { ...merged, id, sanitized_phone: cachedPhone };
  }

  const cachedComplete = normalizePerson(merged);
  if (cachedComplete.email && cachedComplete.telefono) {
    return {
      person: cachedComplete,
      stats: {
        candidates: 1,
        matched: 0,
        with_email: 1,
        with_phone: 1,
        with_both: 1,
        credits_consumed: 0,
        match_errors: [],
      },
    };
  }

  if (!hasTimeLeft(options?.deadlineMs)) {
    return { person: null, stats: emptyEnrichStats() };
  }

  const detail = buildMatchDetail(raw);
  if (!detail) {
    return { person: null, stats: emptyEnrichStats() };
  }

  if (!extractEmail(merged)) {
    const { byId, credits, error } = await bulkMatchPeople([detail], {
      revealEmail: true,
      revealPhone: false,
    });
    creditsConsumed += credits;
    if (error) matchErrors.push(error);
    const matched = byId.get(id);
    if (matched) {
      merged = { ...merged, ...matched };
      apiMatched = 1;
    }
  }

  if (
    extractEmail(merged) &&
    !extractPhone(merged) &&
    hasTimeLeft(options?.deadlineMs)
  ) {
    const phoneDetail = buildMatchDetail(merged);
    if (phoneDetail) {
      const revealed = await revealPhonesSafely(
        [id],
        new Map([[id, phoneDetail]]),
        { deadlineMs: options?.deadlineMs }
      );
      creditsConsumed += revealed.credits;
      matchErrors.push(...revealed.errors);
      const phone = revealed.phones.get(id);
      if (phone) merged = { ...merged, sanitized_phone: phone };
    }
  }

  const person = normalizePerson(merged);
  const withEmail = person.email ? 1 : 0;
  const withPhone = person.telefono ? 1 : 0;
  const withBoth = person.email && person.telefono ? 1 : 0;

  return {
    person: withBoth ? person : null,
    stats: {
      candidates: 1,
      matched: apiMatched,
      with_email: withEmail,
      with_phone: withPhone,
      with_both: withBoth,
      credits_consumed: creditsConsumed,
      match_errors: [...new Set(matchErrors)],
    },
  };
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
      const merged: Record<string, unknown> = { ...(rawById.get(id) ?? {}), ...person };
      // No perder el teléfono que ya estaba en caché (evita pedirlo y pagarlo otra vez).
      const cachedPhone = cachedPhones.get(id);
      if (cachedPhone && !extractPhone(merged)) merged.sanitized_phone = cachedPhone;
      enrichedMap.set(id, merged);
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

  if (needPhone.length) {
    const detailsById = new Map<string, Record<string, unknown>>();
    for (const id of needPhone) {
      const detail = buildMatchDetail(enrichedMap.get(id) ?? rawById.get(id)!);
      if (detail) detailsById.set(id, detail);
    }
    const revealed = await revealPhonesSafely([...detailsById.keys()], detailsById, {
      deadlineMs: options?.deadlineMs,
    });
    creditsConsumed += revealed.credits;
    matchErrors.push(...revealed.errors);
    for (const [id, phone] of revealed.phones) {
      const person = enrichedMap.get(id) ?? rawById.get(id) ?? { id };
      enrichedMap.set(id, { ...person, sanitized_phone: phone });
    }
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
