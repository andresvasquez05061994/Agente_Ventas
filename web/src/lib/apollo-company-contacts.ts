import type { ApolloPerson } from "./types";
import { ApolloApiError } from "./apollo";
import { normalizeOrgName } from "./apollo-filters";
import {
  enrichSinglePersonWithContacts,
  isContactableInSearch,
  resolveApolloPersonId,
} from "./apollo-enrich";
import { getPortfolioApolloIds, recordProspeccionCredits } from "./db";

const BASE_URL =
  process.env.APOLLO_BASE_URL ?? "https://api.apollo.io/api/v1";
const ORG_SEARCH_URL = `${BASE_URL}/mixed_companies/search`;
const PEOPLE_SEARCH_URL = `${BASE_URL}/mixed_people/api_search`;
const TIME_BUDGET_MS = 48000;
const PEOPLE_PAGE_SIZE = 25;
const MAX_PEOPLE_PAGES = 5;
/** Puntaje mínimo para aceptar la mejor coincidencia. */
const MIN_ORG_SCORE = 60;
/** Desde este puntaje se consideran el mismo negocio y se fusionan (duplicados en Apollo). */
const STRONG_ORG_SCORE = 95;

const LEGAL_TOKENS = new Set([
  "s", "a", "sa", "sas", "ltda", "limitada", "esp", "e", "p", "bic", "inc", "corp",
  "corporation", "ltd", "llc", "plc", "cia", "compania", "sociedad", "anonima", "en", "c",
  "zomac", "zese",
]);
const STOP_TOKENS = new Set([
  "de", "del", "la", "las", "los", "el", "y", "and", "the", "of",
  "grupo", "group", "corporacion", "compania", "almacenes",
]);

export type ResolvedOrganization = {
  /** Registro principal (el de mayor puntaje). */
  id: string;
  /** Todos los registros de Apollo que corresponden a la misma empresa. */
  ids: string[];
  name: string;
  domain: string | null;
  score: number;
};

export type OrganizationCandidate = {
  id: string;
  name: string;
  domain: string | null;
  score: number;
  source: "companies" | "people";
};

export type ResolutionDebug = {
  company: string;
  queries: string[];
  candidates: OrganizationCandidate[];
  selected: string[];
  /** Solo en dry run: muestra de personas que devuelve Apollo para los registros elegidos. */
  sample?: Array<{ nombre: string; cargo: unknown; empresa: unknown }>;
};

export type CompanyContactsStatus = "found" | "no_contacts" | "not_found";

export type CompanyContactsResult = {
  status: CompanyContactsStatus;
  organization: ResolvedOrganization | null;
  results: ApolloPerson[];
  total_people: number;
  credits_consumed: number;
  portfolio_skipped: number;
  rejected_other_company: number;
  timed_out: boolean;
  debug?: ResolutionDebug;
};

export type CompanyContactsInput = {
  company: string;
  /** Sigla o nombre comercial detectado en el Excel. */
  alias?: string | null;
  country: string;
  titles: string[];
  allRoles: boolean;
  seniority: string;
  perCompany: number;
  organization?: ResolvedOrganization | null;
  /** Solo resuelve la empresa y cuenta personas; no gasta créditos de enriquecimiento. */
  dryRun?: boolean;
};

function headers() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error("APOLLO_API_KEY no configurada");
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    accept: "application/json",
    "x-api-key": key,
  };
}

async function postApollo(url: string, payload: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  if (res.status === 429) {
    throw new ApolloApiError(
      "Límite de solicitudes Apollo alcanzado. Espera un momento e intenta de nuevo.",
      429
    );
  }
  if (!res.ok) {
    const text = await res.text();
    if (/insufficient credits/i.test(text)) {
      throw new ApolloApiError("Sin créditos Apollo disponibles. Recarga tu plan y vuelve a buscar.", 402);
    }
    if (res.status === 403 && text.includes("master")) {
      throw new ApolloApiError("Tu API key debe ser Master API Key en Apollo → Settings → API.", 403);
    }
    throw new ApolloApiError(`Apollo ${res.status}: ${text.slice(0, 200)}`, res.status);
  }
  return (await res.json()) as Record<string, unknown>;
}

/** Tokens del nombre sin la forma jurídica final (S.A., S.A.S., E.S.P., Ltda…). */
function coreTokens(name: string): string[] {
  const tokens = normalizeOrgName(name)
    .split(" ")
    .filter((t) => t.length > 0);
  while (tokens.length > 1 && LEGAL_TOKENS.has(tokens[tokens.length - 1])) tokens.pop();
  while (tokens.length > 1 && STOP_TOKENS.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens;
}

/** Mejor puntaje del candidato contra la razón social o su sigla. */
export function companyMatchScore(
  candidate: string,
  company: string,
  alias?: string | null
): number {
  const base = organizationNameScore(candidate, company);
  if (!alias) return base;
  return Math.max(base, organizationNameScore(candidate, alias));
}

function meaningful(tokens: string[]): string[] {
  return tokens.filter((t) => !STOP_TOKENS.has(t));
}

/** 0–100: qué tanto el nombre de Apollo corresponde al nombre del Excel. */
export function organizationNameScore(candidate: string, target: string): number {
  const cTokens = coreTokens(candidate);
  const tTokens = coreTokens(target);
  const c = cTokens.join(" ");
  const t = tTokens.join(" ");
  if (!c || !t) return 0;
  if (c === t) return 100;

  if (c.includes(t) || t.includes(c)) {
    const ratio = Math.min(c.length, t.length) / Math.max(c.length, t.length);
    return Math.round(70 + 30 * ratio);
  }

  const cMeaning = meaningful(cTokens);
  const tMeaning = meaningful(tTokens);
  if (cMeaning.length === 1 && cMeaning[0].length >= 4 && tMeaning.includes(cMeaning[0])) {
    return 80;
  }

  const cSet = new Set(cMeaning);
  const tSet = new Set(tMeaning);
  if (!cSet.size || !tSet.size) return 0;
  let shared = 0;
  for (const token of cSet) if (tSet.has(token)) shared++;
  const union = new Set([...cSet, ...tSet]).size;
  return Math.round((shared / union) * 100);
}

/** Variantes del nombre para buscar en Apollo (sin sufijos legales, sigla, primeras palabras). */
export function organizationQueries(name: string, alias?: string | null): string[] {
  const queries: string[] = [];
  const push = (value: string) => {
    const v = value.replace(/\s+/g, " ").trim();
    if (v.length >= 2 && !queries.some((q) => q.toLowerCase() === v.toLowerCase())) {
      queries.push(v);
    }
  };

  const core = coreTokens(name);
  push(core.join(" "));
  if (alias) push(coreTokens(alias).join(" "));

  for (const segment of name.split(/\s[-–]\s|\//)) {
    const seg = coreTokens(segment);
    if (seg.length && seg.length < core.length) push(seg.join(" "));
  }

  const words = meaningful(core);
  if (words.length > 3) push(words.slice(0, 3).join(" "));

  return queries.slice(0, 4);
}

type RawOrg = { id: string; name: string; domain: string | null };

function toRawOrg(org: Record<string, unknown> | undefined | null): RawOrg | null {
  if (!org) return null;
  const id = String(org.organization_id ?? org.id ?? "").trim();
  const name = String(org.name ?? "").trim();
  if (!id || !name) return null;
  return { id, name, domain: (org.primary_domain as string | undefined) ?? null };
}

/**
 * Búsqueda de empresas por nombre (1 crédito). Sin filtro de país: Apollo oculta
 * registros válidos cuando se envía `organization_locations`.
 */
async function searchOrganizations(query: string): Promise<RawOrg[]> {
  const data = await postApollo(ORG_SEARCH_URL, { page: 1, per_page: 25, q_organization_name: query });
  const orgs = (data.organizations ?? data.accounts ?? []) as Array<Record<string, unknown>>;
  return orgs.map(toRawOrg).filter((org): org is RawOrg => org !== null);
}

/**
 * Descubrimiento gratuito: busca personas por palabra clave y toma las empresas
 * donde trabajan. Encuentra los registros de Apollo que realmente tienen personas.
 */
async function organizationsFromPeople(query: string): Promise<RawOrg[]> {
  const data = await postApollo(PEOPLE_SEARCH_URL, { page: 1, per_page: 25, q_keywords: query });
  const people = (data.people ?? data.contacts ?? []) as Record<string, unknown>[];
  const seen = new Set<string>();
  const out: RawOrg[] = [];
  for (const person of people) {
    const org = toRawOrg(person.organization as Record<string, unknown> | undefined);
    if (!org || seen.has(org.id)) continue;
    seen.add(org.id);
    out.push(org);
  }
  return out;
}

/** Ubica la empresa del Excel en Apollo y fusiona registros duplicados. */
export async function resolveOrganization(
  company: string,
  alias: string | null = null
): Promise<{ organization: ResolvedOrganization | null; credits: number; debug: ResolutionDebug }> {
  const queries = organizationQueries(company, alias);
  const byId = new Map<string, OrganizationCandidate>();
  let credits = 0;

  const add = (orgs: RawOrg[], source: OrganizationCandidate["source"]) => {
    for (const org of orgs) {
      if (byId.has(org.id)) continue;
      byId.set(org.id, { ...org, score: companyMatchScore(org.name, company, alias), source });
    }
  };
  const best = () => Math.max(0, ...[...byId.values()].map((c) => c.score));

  for (const query of queries) {
    add(await searchOrganizations(query), "companies");
    credits++;
    if (best() >= STRONG_ORG_SCORE) break;
  }

  for (const query of queries.slice(0, alias ? 2 : 1)) {
    try {
      add(await organizationsFromPeople(query), "people");
    } catch (e) {
      if (e instanceof ApolloApiError && (e.status === 429 || e.status === 402)) throw e;
    }
  }

  const candidates = [...byId.values()].sort((a, b) => b.score - a.score);
  const strong = candidates.filter((c) => c.score >= STRONG_ORG_SCORE);
  const chosen = strong.length ? strong : candidates.slice(0, 1).filter((c) => c.score >= MIN_ORG_SCORE);
  const debug: ResolutionDebug = { company, queries, candidates, selected: chosen.map((c) => c.id) };

  if (!chosen.length) return { organization: null, credits, debug };
  const top = chosen[0];
  return {
    organization: {
      id: top.id,
      ids: chosen.map((c) => c.id),
      name: top.name,
      domain: top.domain ?? chosen.find((c) => c.domain)?.domain ?? null,
      score: top.score,
    },
    credits,
    debug,
  };
}

/** ¿El empleador actual de la persona es la empresa del Excel (o uno de sus registros en Apollo)? */
function employerMatches(
  employer: string | null | undefined,
  organization: ResolvedOrganization,
  company: string,
  alias: string | null,
  candidates: OrganizationCandidate[]
): boolean {
  if (!employer) return false;
  if (companyMatchScore(employer, company, alias) >= MIN_ORG_SCORE) return true;
  if (organizationNameScore(employer, organization.name) >= STRONG_ORG_SCORE) return true;
  return candidates.some(
    (c) => organization.ids.includes(c.id) && organizationNameScore(employer, c.name) >= STRONG_ORG_SCORE
  );
}

function maxEnrichAttempts(target: number): number {
  return Math.min(40, Math.max(target + 5, target * 3));
}

/** Solo personas cuyo empleador actual es la empresa resuelta del Excel. */
export async function searchCompanyContacts(
  input: CompanyContactsInput
): Promise<CompanyContactsResult> {
  const started = Date.now();
  const deadlineMs = started + TIME_BUDGET_MS;
  let credits = 0;

  let organization = input.organization ?? null;
  let debug: ResolutionDebug | undefined;
  let candidates: OrganizationCandidate[] = [];
  if (!organization) {
    const resolved = await resolveOrganization(input.company, input.alias ?? null);
    credits += resolved.credits;
    organization = resolved.organization;
    debug = resolved.debug;
    candidates = resolved.debug.candidates;
  }

  if (!organization) {
    if (credits > 0) await recordProspeccionCredits(credits, 0, "search");
    return {
      status: "not_found",
      organization: null,
      results: [],
      total_people: 0,
      credits_consumed: credits,
      portfolio_skipped: 0,
      rejected_other_company: 0,
      timed_out: false,
      debug,
    };
  }

  const org: ResolvedOrganization = organization;
  const buildPeoplePayload = (page: number, perPage: number) => {
    const payload: Record<string, unknown> = {
      page,
      per_page: perPage,
      organization_ids: org.ids,
      contact_email_status: ["verified", "likely to engage"],
    };
    if (!input.allRoles && input.titles.length) payload.person_titles = input.titles;
    if (input.seniority) payload.person_seniorities = [input.seniority];
    return payload;
  };

  if (input.dryRun) {
    const data = await postApollo(PEOPLE_SEARCH_URL, buildPeoplePayload(1, 5));
    const pagination = data.pagination as { total_entries?: number } | undefined;
    const sample = ((data.people ?? data.contacts ?? []) as Record<string, unknown>[]).map((p) => {
      const org = p.organization as Record<string, unknown> | undefined;
      return { nombre: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(), cargo: p.title, empresa: org?.name };
    });
    if (credits > 0) await recordProspeccionCredits(credits, 0, "search");
    return {
      status: "no_contacts",
      organization,
      results: [],
      total_people: Number(data.total_entries ?? pagination?.total_entries ?? 0) || 0,
      credits_consumed: credits,
      portfolio_skipped: 0,
      rejected_other_company: 0,
      timed_out: false,
      debug: debug ? { ...debug, sample } : undefined,
    };
  }

  const portfolioIds = await getPortfolioApolloIds();
  const target = input.perCompany;
  const enrichLimit = maxEnrichAttempts(target);
  const collected: ApolloPerson[] = [];
  const seen = new Set<string>();
  let totalPeople = 0;
  let attempts = 0;
  let portfolioSkipped = 0;
  let rejected = 0;
  let timedOut = false;

  for (let page = 1; page <= MAX_PEOPLE_PAGES; page++) {
    if (collected.length >= target || attempts >= enrichLimit) break;
    if (Date.now() > deadlineMs) {
      timedOut = true;
      break;
    }

    const data = await postApollo(PEOPLE_SEARCH_URL, buildPeoplePayload(page, PEOPLE_PAGE_SIZE));
    const people = (data.people ?? data.contacts ?? []) as Record<string, unknown>[];
    const pagination = data.pagination as { total_entries?: number; total_pages?: number } | undefined;
    totalPeople = Number(data.total_entries ?? pagination?.total_entries ?? totalPeople) || totalPeople;
    if (!people.length) break;

    for (const person of people) {
      if (collected.length >= target || attempts >= enrichLimit) break;
      if (Date.now() > deadlineMs) {
        timedOut = true;
        break;
      }
      const id = resolveApolloPersonId(person);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (portfolioIds.has(id)) {
        portfolioSkipped++;
        continue;
      }
      if (!isContactableInSearch(person)) continue;

      attempts++;
      const enriched = await enrichSinglePersonWithContacts(person, { deadlineMs });
      credits += enriched.stats.credits_consumed;
      if (!enriched.person) continue;

      if (!employerMatches(enriched.person.empresa, org, input.company, input.alias ?? null, candidates)) {
        rejected++;
        continue;
      }
      collected.push({ ...enriched.person, empresa: org.name });
    }

    if (timedOut) break;
    const totalPages =
      pagination?.total_pages ?? Math.ceil(totalPeople / PEOPLE_PAGE_SIZE);
    if (page >= totalPages) break;
  }

  await recordProspeccionCredits(credits, collected.length, "search");

  return {
    status: collected.length ? "found" : "no_contacts",
    organization: org,
    results: collected,
    total_people: totalPeople,
    credits_consumed: credits,
    portfolio_skipped: portfolioSkipped,
    rejected_other_company: rejected,
    timed_out: timedOut,
    debug,
  };
}
