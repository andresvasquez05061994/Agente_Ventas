import type { ApolloPerson } from "./types";
import { ApolloApiError } from "./apollo";
import { normalizeOrgName, organizationMatches } from "./apollo-filters";
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
const MIN_ORG_SCORE = 60;

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
  id: string;
  name: string;
  domain: string | null;
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
};

export type CompanyContactsInput = {
  company: string;
  country: string;
  titles: string[];
  allRoles: boolean;
  seniority: string;
  perCompany: number;
  organization?: ResolvedOrganization | null;
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

function coreTokens(name: string): string[] {
  return normalizeOrgName(name)
    .split(" ")
    .filter((t) => t.length > 0 && !LEGAL_TOKENS.has(t));
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
export function organizationQueries(name: string): string[] {
  const queries: string[] = [];
  const push = (value: string) => {
    const v = value.replace(/\s+/g, " ").trim();
    if (v.length >= 2 && !queries.some((q) => q.toLowerCase() === v.toLowerCase())) {
      queries.push(v);
    }
  };

  const core = coreTokens(name);
  push(core.join(" "));

  for (const segment of name.split(/\s[-–]\s|\//)) {
    const seg = coreTokens(segment);
    if (seg.length && seg.length < core.length) push(seg.join(" "));
  }

  const words = meaningful(core);
  if (words.length > 3) push(words.slice(0, 3).join(" "));

  return queries.slice(0, 3);
}

async function searchOrganizations(
  query: string,
  country: string | null
): Promise<ResolvedOrganization[]> {
  const payload: Record<string, unknown> = { page: 1, per_page: 10, q_organization_name: query };
  if (country) payload.organization_locations = [country];
  const data = await postApollo(ORG_SEARCH_URL, payload);
  const orgs = (data.organizations ?? data.accounts ?? []) as Array<Record<string, unknown>>;
  return orgs
    .map((org) => ({
      id: String(org.organization_id ?? org.id ?? "").trim(),
      name: String(org.name ?? "").trim(),
      domain: (org.primary_domain as string | undefined) ?? null,
    }))
    .filter((org) => org.id && org.name);
}

/** Ubica la empresa del Excel en Apollo. Cada consulta de empresas cuesta 1 crédito. */
export async function resolveOrganization(
  company: string,
  country: string
): Promise<{ organization: ResolvedOrganization | null; credits: number }> {
  const queries = organizationQueries(company);
  const candidates: ResolvedOrganization[] = [];
  let credits = 0;

  const bestOf = () => {
    let top: { org: ResolvedOrganization; score: number } | null = null;
    for (const org of candidates) {
      const score = organizationNameScore(org.name, company);
      if (!top || score > top.score) top = { org, score };
    }
    return top;
  };

  for (const query of queries) {
    candidates.push(...(await searchOrganizations(query, country || null)));
    credits++;
    if ((bestOf()?.score ?? 0) >= 90) break;
  }

  if ((bestOf()?.score ?? 0) < MIN_ORG_SCORE && country && queries[0]) {
    candidates.push(...(await searchOrganizations(queries[0], null)));
    credits++;
  }

  const top = bestOf();
  if (!top || top.score < MIN_ORG_SCORE) return { organization: null, credits };
  return { organization: top.org, credits };
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
  if (!organization) {
    const resolved = await resolveOrganization(input.company, input.country);
    credits += resolved.credits;
    organization = resolved.organization;
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

    const payload: Record<string, unknown> = {
      page,
      per_page: PEOPLE_PAGE_SIZE,
      organization_ids: [organization.id],
      contact_email_status: ["verified", "likely to engage"],
    };
    if (!input.allRoles && input.titles.length) payload.person_titles = input.titles;
    if (input.seniority) payload.person_seniorities = [input.seniority];

    const data = await postApollo(PEOPLE_SEARCH_URL, payload);
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

      const employer = enriched.person.empresa;
      if (
        !organizationMatches(employer, organization.name) &&
        !organizationMatches(employer, input.company)
      ) {
        rejected++;
        continue;
      }
      collected.push({ ...enriched.person, empresa: organization.name });
    }

    if (timedOut) break;
    const totalPages =
      pagination?.total_pages ?? Math.ceil(totalPeople / PEOPLE_PAGE_SIZE);
    if (page >= totalPages) break;
  }

  await recordProspeccionCredits(credits, collected.length, "search");

  return {
    status: collected.length ? "found" : "no_contacts",
    organization,
    results: collected,
    total_people: totalPeople,
    credits_consumed: credits,
    portfolio_skipped: portfolioSkipped,
    rejected_other_company: rejected,
    timed_out: timedOut,
  };
}
