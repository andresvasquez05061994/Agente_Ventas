import type { ApolloPerson } from "./types";
import { ApolloApiError } from "./apollo";
import { normalizeOrgName } from "./apollo-filters";
import {
  enrichPeopleWithContacts,
  isContactableInSearch,
  resolveApolloPersonId,
  webhookBaseUrl,
} from "./apollo-enrich";
import { getPhoneWebhookHealth, getPortfolioApolloIds, recordProspeccionCredits } from "./db";

const BASE_URL =
  process.env.APOLLO_BASE_URL ?? "https://api.apollo.io/api/v1";
const ORG_SEARCH_URL = `${BASE_URL}/mixed_companies/search`;
const PEOPLE_SEARCH_URL = `${BASE_URL}/mixed_people/api_search`;
const TIME_BUDGET_MS = 48000;
const PEOPLE_PAGE_SIZE = 25;
const MAX_PEOPLE_PAGES = 4;
/** Puntaje mínimo para aceptar la mejor coincidencia de empresa. */
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
  /** Registro principal (el de mayor puntaje). Vacío si solo se encontró por nombre de empleador. */
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
};

export type EmployerProbe = {
  query: string;
  total: number;
  /** Nombres de empleador vistos en la primera página y si pasan el filtro estricto. */
  employers: Array<{ name: string; people: number; accepted: boolean }>;
};

export type ResolutionDebug = {
  company: string;
  alias: string | null;
  queries: string[];
  candidates: OrganizationCandidate[];
  selected: string[];
  employer_probe: EmployerProbe[];
  /** Personas de la empresa halladas en Apollo (antes de enriquecer). */
  matched_people?: number;
  /** De esas, cuántas marca Apollo con teléfono directo disponible. */
  matched_with_phone?: number;
  /** Solo en dry run: personas que pasarían a enriquecimiento. */
  sample?: Array<{ nombre: string; cargo: unknown; empresa: unknown; via: string }>;
  /** Solo en dry run: estado del webhook de teléfonos. */
  phone_webhook?: Record<string, unknown>;
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

/** Consultas de palabra clave para la búsqueda de personas: razón social y sigla. */
function keywordQueries(company: string, alias: string | null): string[] {
  const out: string[] = [];
  const core = coreTokens(company).join(" ");
  if (core.length >= 3) out.push(core);
  if (alias) {
    const a = coreTokens(alias).join(" ");
    if (a.length >= 3 && !out.includes(a)) out.push(a);
  }
  return out;
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

/** Ubica los registros de la empresa en Apollo (búsqueda de empresas, 1 crédito por consulta). */
export async function resolveOrganization(
  company: string,
  alias: string | null = null
): Promise<{ organization: ResolvedOrganization | null; credits: number; debug: ResolutionDebug }> {
  const queries = organizationQueries(company, alias);
  const byId = new Map<string, OrganizationCandidate>();
  let credits = 0;

  const add = (orgs: RawOrg[]) => {
    for (const org of orgs) {
      if (byId.has(org.id)) continue;
      byId.set(org.id, { ...org, score: companyMatchScore(org.name, company, alias) });
    }
  };
  const best = () => Math.max(0, ...[...byId.values()].map((c) => c.score));

  for (const query of queries) {
    add(await searchOrganizations(query));
    credits++;
    if (best() >= STRONG_ORG_SCORE) break;
  }

  const candidates = [...byId.values()].sort((a, b) => b.score - a.score);
  const strong = candidates.filter((c) => c.score >= STRONG_ORG_SCORE);
  const chosen = strong.length ? strong : candidates.slice(0, 1).filter((c) => c.score >= MIN_ORG_SCORE);
  const debug: ResolutionDebug = {
    company,
    alias,
    queries,
    candidates,
    selected: chosen.map((c) => c.id),
    employer_probe: [],
  };

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

/** Nombre del empleador tal como lo trae la búsqueda de personas. */
function employerName(person: Record<string, unknown>): string {
  const org = person.organization as Record<string, unknown> | undefined;
  return String(org?.name ?? "").trim();
}

/**
 * Filtro estricto para personas halladas por palabra clave: el empleador debe ser
 * la misma empresa (razón social o sigla), no una filial o un nombre parecido.
 */
function employerIsCompany(
  employer: string,
  company: string,
  alias: string | null,
  organization: ResolvedOrganization | null
): boolean {
  if (!employer) return false;
  if (companyMatchScore(employer, company, alias) >= STRONG_ORG_SCORE) return true;
  if (organization && organizationNameScore(employer, organization.name) >= STRONG_ORG_SCORE) return true;
  return false;
}

/** Validación final tras enriquecer (el perfil completo trae el empleador actual). */
function enrichedEmployerMatches(
  employer: string | null | undefined,
  company: string,
  alias: string | null,
  organization: ResolvedOrganization | null,
  candidates: OrganizationCandidate[]
): boolean {
  if (!employer) return false;
  if (companyMatchScore(employer, company, alias) >= MIN_ORG_SCORE) return true;
  if (organization && organizationNameScore(employer, organization.name) >= STRONG_ORG_SCORE) return true;
  return candidates.some(
    (c) => organization?.ids.includes(c.id) && organizationNameScore(employer, c.name) >= STRONG_ORG_SCORE
  );
}

/** Cuántas personas se mandan a enriquecer para lograr `target` contactos completos. */
function candidateBudget(target: number): number {
  return Math.min(20, Math.max(target + 3, target * 2));
}

/** Máximo de personas de la empresa que se revisan antes de elegir a quién enriquecer. */
const SCAN_LIMIT = 80;

function hasPhoneFlag(raw: Record<string, unknown>): boolean {
  return raw.has_direct_phone === true || raw.has_direct_phone === "Yes";
}

type PeopleSource =
  | { kind: "organization"; label: string; payload: Record<string, unknown> }
  | { kind: "keyword"; label: string; payload: Record<string, unknown> };

/**
 * Contactos cuyo empleador actual es la empresa del Excel.
 *
 * Dos fuentes, ambas gratuitas en Apollo:
 *  1. Personas de los registros de empresa resueltos (`organization_ids`).
 *  2. Personas halladas por palabra clave (razón social / sigla) cuyo empleador
 *     coincide exactamente con la empresa. Cubre registros que la búsqueda de
 *     empresas de Apollo no devuelve.
 */
export async function searchCompanyContacts(
  input: CompanyContactsInput
): Promise<CompanyContactsResult> {
  const started = Date.now();
  const deadlineMs = started + TIME_BUDGET_MS;
  const alias = input.alias ?? null;
  let credits = 0;

  let organization = input.organization ?? null;
  let debug: ResolutionDebug = {
    company: input.company,
    alias,
    queries: [],
    candidates: [],
    selected: organization?.ids ?? [],
    employer_probe: [],
  };
  if (!organization) {
    const resolved = await resolveOrganization(input.company, alias);
    credits += resolved.credits;
    organization = resolved.organization;
    debug = resolved.debug;
  }
  const candidates = debug.candidates;

  const baseFilters = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
      contact_email_status: ["verified", "likely to engage"],
    };
    if (!input.allRoles && input.titles.length) payload.person_titles = input.titles;
    if (input.seniority) payload.person_seniorities = [input.seniority];
    return payload;
  };

  const sources: PeopleSource[] = [];
  if (organization && organization.ids.length) {
    sources.push({
      kind: "organization",
      label: organization.name,
      payload: { ...baseFilters(), organization_ids: organization.ids },
    });
  }
  for (const keyword of keywordQueries(input.company, alias)) {
    sources.push({ kind: "keyword", label: keyword, payload: { ...baseFilters(), q_keywords: keyword } });
  }

  const finish = async (
    status: CompanyContactsStatus,
    results: ApolloPerson[],
    extra: Partial<CompanyContactsResult> = {}
  ): Promise<CompanyContactsResult> => {
    if (credits > 0 || results.length) await recordProspeccionCredits(credits, results.length, "search");
    return {
      status,
      organization,
      results,
      total_people: 0,
      credits_consumed: credits,
      portfolio_skipped: 0,
      rejected_other_company: 0,
      timed_out: false,
      debug,
      ...extra,
    };
  };

  if (!sources.length) return finish("not_found", []);

  const portfolioIds = input.dryRun ? new Set<string>() : await getPortfolioApolloIds();
  const target = input.perCompany;
  const wanted = candidateBudget(target);
  let candidatesToEnrich: Array<{ raw: Record<string, unknown>; via: string; employer: string }> = [];
  const seen = new Set<string>();
  const acceptedEmployers = new Set<string>();
  let totalPeople = 0;
  let portfolioSkipped = 0;
  let timedOut = false;

  outer: for (const source of sources) {
    for (let page = 1; page <= MAX_PEOPLE_PAGES; page++) {
      if (candidatesToEnrich.length >= SCAN_LIMIT) break outer;
      if (Date.now() > deadlineMs) {
        timedOut = true;
        break outer;
      }

      const data = await postApollo(PEOPLE_SEARCH_URL, {
        ...source.payload,
        page,
        per_page: PEOPLE_PAGE_SIZE,
      });
      const people = (data.people ?? data.contacts ?? []) as Record<string, unknown>[];
      const pagination = data.pagination as { total_entries?: number; total_pages?: number } | undefined;
      const total = Number(data.total_entries ?? pagination?.total_entries ?? 0) || 0;

      if (page === 1) {
        const employers = new Map<string, { people: number; accepted: boolean }>();
        for (const person of people) {
          const name = employerName(person) || "(sin empresa)";
          const entry = employers.get(name) ?? {
            people: 0,
            accepted:
              source.kind === "organization" || employerIsCompany(name, input.company, alias, organization),
          };
          entry.people++;
          employers.set(name, entry);
        }
        debug.employer_probe.push({
          query: source.kind === "organization" ? `ids:${source.label}` : source.label,
          total,
          employers: [...employers.entries()].map(([name, e]) => ({ name, ...e })),
        });
        if (source.kind === "organization") totalPeople += total;
      }
      if (!people.length) break;

      for (const person of people) {
        if (candidatesToEnrich.length >= SCAN_LIMIT) break outer;
        const id = resolveApolloPersonId(person);
        if (!id || seen.has(id)) continue;
        seen.add(id);

        const employer = employerName(person);
        if (source.kind === "keyword" && !employerIsCompany(employer, input.company, alias, organization)) {
          continue;
        }
        if (portfolioIds.has(id)) {
          portfolioSkipped++;
          continue;
        }
        if (!isContactableInSearch(person)) continue;
        acceptedEmployers.add(employer);
        candidatesToEnrich.push({
          raw: person,
          employer,
          via: source.kind === "organization" ? "registro" : `palabra clave «${source.label}»`,
        });
      }

      const totalPages = pagination?.total_pages ?? Math.ceil(total / PEOPLE_PAGE_SIZE);
      if (page >= totalPages) break;
    }
  }

  if (!organization && acceptedEmployers.size) {
    const name = [...acceptedEmployers][0];
    organization = { id: "", ids: [], name, domain: null, score: 100 };
  }

  // Prioridad: perfiles para los que Apollo ya indica que tiene teléfono directo.
  const matchedTotal = candidatesToEnrich.length;
  const withPhoneFlag = candidatesToEnrich.filter((c) => hasPhoneFlag(c.raw)).length;
  candidatesToEnrich = candidatesToEnrich
    .sort((a, b) => Number(hasPhoneFlag(b.raw)) - Number(hasPhoneFlag(a.raw)))
    .slice(0, wanted);
  debug.matched_people = matchedTotal;
  debug.matched_with_phone = withPhoneFlag;

  if (input.dryRun) {
    try {
      debug.phone_webhook = {
        base_url: webhookBaseUrl(),
        ...(await getPhoneWebhookHealth()),
      };
    } catch (e) {
      debug.phone_webhook = { error: String(e) };
    }
    debug.sample = candidatesToEnrich.slice(0, 10).map((c) => ({
      nombre: `${c.raw.first_name ?? ""} ${c.raw.last_name ?? ""}`.trim(),
      cargo: c.raw.title,
      empresa: c.employer,
      via: c.via,
    }));
    return finish(candidatesToEnrich.length ? "found" : organization ? "no_contacts" : "not_found", [], {
      total_people: totalPeople,
      portfolio_skipped: portfolioSkipped,
      timed_out: timedOut,
    });
  }

  // Enriquecimiento por lotes: correo en lote y luego teléfono en lote (una sola espera del webhook).
  const collected: ApolloPerson[] = [];
  let rejected = 0;
  if (candidatesToEnrich.length && Date.now() < deadlineMs) {
    const enriched = await enrichPeopleWithContacts(
      candidatesToEnrich.map((c) => c.raw),
      { targetComplete: target, deadlineMs }
    );
    credits += enriched.stats.credits_consumed;
    const employerById = new Map(
      candidatesToEnrich.map((c) => [resolveApolloPersonId(c.raw), c.employer] as const)
    );
    for (const person of enriched.results) {
      const employer = person.empresa ?? employerById.get(person.apollo_id) ?? "";
      if (!enrichedEmployerMatches(employer, input.company, alias, organization, candidates)) {
        rejected++;
        continue;
      }
      collected.push({ ...person, empresa: employer || organization?.name || input.company });
    }
    if (Date.now() > deadlineMs) timedOut = true;
  }

  const status: CompanyContactsStatus = collected.length
    ? "found"
    : organization || acceptedEmployers.size
      ? "no_contacts"
      : "not_found";

  return finish(status, collected, {
    total_people: totalPeople,
    portfolio_skipped: portfolioSkipped,
    rejected_other_company: rejected,
    timed_out: timedOut,
  });
}
