import { ApolloApiError, searchPeopleCandidates } from "./apollo";
import { searchApolloOrganizations } from "./apollo-organizations";
import {
  enrichSinglePersonWithContacts,
  identifyPersonByAttributes,
  isContactableInSearch,
  resolveApolloPersonId,
} from "./apollo-enrich";
import {
  APOLLO_COUNTRIES,
  organizationMatches,
  organizationMatchesLoose,
  personMatchesCountry,
} from "./apollo-filters";
import { MIN_NAME_SCORE, nameScore, nameTokens } from "./excel-attendees";
import { companySearchHint } from "./excel-companies";
import {
  getLeadByApolloId,
  getNoContestaContacts,
  getPortfolioApolloIds,
  isNoContestaContact,
  recordProspeccionCredits,
} from "./db";
import type { ApolloPerson } from "./types";

const TIME_BUDGET_MS = 48000;
const COUNTRY_VALUES = new Set<string>(APOLLO_COUNTRIES.map((item) => item.value));

export type AttendeeMatchStatus = "found" | "no_contacts" | "not_found";

export type AttendeeMatchInput = {
  name: string;
  title?: string;
  company?: string;
  /** País único (compatibilidad). Si viene `countries`, se ignora. */
  country?: string;
  /** Vacío = todos los países, sin filtro de ubicación. */
  countries?: string[];
};

export type AttendeeMatchResult = {
  status: AttendeeMatchStatus;
  person: ApolloPerson | null;
  credits_consumed: number;
  already_saved?: boolean;
};

function lastNameOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(1).join(" ") || parts[0] || name;
}

export function foldPersonQuery(name: string): string {
  return nameTokens(name).join(" ") || name;
}

/** Variantes conservadoras para nombres con dos apellidos o datos abreviados en Apollo. */
export function personSearchVariants(name: string): string[] {
  const tokens = nameTokens(name);
  if (!tokens.length) return [];
  const variants = new Set<string>();
  const add = (parts: string[]) => {
    const value = parts.filter(Boolean).join(" ").trim();
    if (value) variants.add(value);
  };

  add(tokens);
  if (tokens.length >= 3) {
    add(tokens.slice(0, -1)); // Iago Soto Mata → Iago Soto
    add([tokens[0], tokens[tokens.length - 1]]); // Iago Soto Mata → Iago Mata
  }
  if (tokens.length >= 2) add([tokens[0], tokens[1]]);
  add(tokens.slice(1));
  return [...variants].slice(0, 5);
}

export function apolloPlainName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildIdentifyDetail(input: AttendeeMatchInput): Record<string, unknown> {
  const name = apolloPlainName(input.name);
  const parts = name.split(/\s+/).filter(Boolean);
  const brand = input.company ? companySearchHint(input.company) : "";
  const detail: Record<string, unknown> = {};
  if (name) detail.name = name;
  if (parts[0]) detail.first_name = parts[0];
  if (parts.length > 1) detail.last_name = parts.slice(1).join(" ");
  if (brand) detail.organization_name = brand;
  else if (input.company?.trim()) detail.organization_name = apolloPlainName(input.company);
  return detail;
}

export function obfuscatedTokenFits(token: string, masked: string): boolean {
  const value = token.toLowerCase().replace(/[^a-z0-9]/g, "");
  const mask = masked.toLowerCase().replace(/[^a-z0-9*]/g, "");
  const star = mask.indexOf("*");
  if (!value || !mask || star < 0) return false;
  const prefix = mask.slice(0, star);
  const suffix = mask.slice(mask.lastIndexOf("*") + 1);
  if (prefix.length < 1) return false;
  return value.startsWith(prefix) && (suffix.length === 0 || value.endsWith(suffix));
}

/** La máscara de Apollo puede cubrir un apellido o los dos juntos (Ca***l = Castelo Pichel). */
export function obfuscatedSurnamesFit(surnames: string[], masked: string): boolean {
  const tokens = surnames.map((token) => token.toLowerCase().replace(/[^a-z0-9]/g, "")).filter(Boolean);
  if (!tokens.length || !masked.includes("*")) return false;
  if (tokens.some((token) => obfuscatedTokenFits(token, masked))) return true;
  return obfuscatedTokenFits(tokens.join(""), masked);
}

function employerDomain(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .trim();
}

function personDisplayName(raw: Record<string, unknown>): string {
  if (typeof raw.name === "string" && raw.name.trim()) return raw.name;
  return `${raw.first_name ?? ""} ${raw.last_name ?? raw.last_name_obfuscated ?? ""}`.trim();
}

function personOrgName(raw: Record<string, unknown>): string {
  return (
    (raw.organization as { name?: string } | undefined)?.name ??
    (typeof raw.organization_name === "string" ? raw.organization_name : "") ??
    ""
  );
}

function companyFits(org: string, company: string): boolean {
  if (!company.trim()) return true;
  const hint = companySearchHint(company);
  return (
    organizationMatches(org, company) ||
    (Boolean(hint) && organizationMatches(org, hint)) ||
    organizationMatchesLoose(org, company)
  );
}

export function locationsOf(input: AttendeeMatchInput): string[] {
  if (Array.isArray(input.countries)) return input.countries.filter(Boolean);
  if (input.country?.trim()) return [input.country.trim()];
  return [];
}

/** Vacío = todos los países. `all_countries: true` gana sobre la lista. */
export function parseMatchCountries(
  body: Record<string, unknown>
): { countries: string[] } | { error: string } {
  if (body.all_countries === true) return { countries: [] };

  const fromList = Array.isArray(body.countries)
    ? body.countries.map((item) => String(item ?? "").trim())
    : null;
  const fromSingle = body.country != null ? [String(body.country).trim()] : null;
  const unique = [...new Set((fromList ?? fromSingle ?? []).filter(Boolean))];
  if (!unique.length) return { countries: [] };
  if (unique.some((country) => !COUNTRY_VALUES.has(country))) {
    return { error: "País no válido." };
  }
  return { countries: unique };
}

function matchesSelectedCountry(raw: Record<string, unknown>, locations: string[]): boolean {
  if (!locations.length) return true;
  return locations.some((country) => personMatchesCountry(raw, country));
}

export function buildAttendeeSearchPayloads(input: AttendeeMatchInput): Record<string, unknown>[] {
  const original = apolloPlainName(input.name) || input.name.trim();
  const accented = input.name.trim();
  const folded = foldPersonQuery(input.name);
  const last = lastNameOf(input.name);
  const brand = input.company ? companySearchHint(input.company) : "";
  const locations = locationsOf(input);
  const locationFilter = locations.length ? { person_locations: locations } : {};
  const payloads: Record<string, unknown>[] = [];

  const push = (extra: Record<string, unknown>, query = original) => {
    payloads.push({
      page: 1,
      per_page: 25,
      q_keywords: query,
      ...locationFilter,
      ...extra,
    });
  };

  if (brand) push({ q_organization_name: brand });
  push({});
  if (accented && accented !== original) push({ q_keywords: accented });
  if (folded && folded !== original && folded !== original.toLowerCase() && folded !== accented.toLowerCase()) {
    push({ q_keywords: folded });
  }
  if (last && last !== original && last !== folded) {
    push({
      q_keywords: last,
      ...(brand ? { q_organization_name: brand } : {}),
    });
  }
  for (const variant of personSearchVariants(input.name)) {
    if (variant !== original && variant !== folded && variant !== last) {
      push(brand ? { q_organization_name: brand } : {}, variant);
    }
  }

  const seen = new Set<string>();
  return payloads.filter((payload) => {
    const key = JSON.stringify(payload);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function pickAttendeeCandidate(
  people: Record<string, unknown>[],
  input: AttendeeMatchInput
): Record<string, unknown> | null {
  const company = input.company?.trim() ?? "";
  const minScore = company ? MIN_NAME_SCORE : 92;
  let best: { person: Record<string, unknown>; rank: number } | null = null;

  for (const raw of people) {
    const id = resolveApolloPersonId(raw);
    if (!id) continue;
    const display = personDisplayName(raw);
    const score = nameScore(input.name, display);
    if (score < minScore) continue;

    const org = personOrgName(raw);
    const orgOk = companyFits(org, company);
    if (company && org && !orgOk) continue;
    if (company && !org && score < 96) continue;

    const locations = locationsOf(input);
    const sameCountry = matchesSelectedCountry(raw, locations);
    if (locations.length && !sameCountry) continue;

    const rank = score + (orgOk ? 6 : 0) + (sameCountry ? 3 : 0);
    if (!best || rank > best.rank) best = { person: raw, rank };
  }
  return best?.person ?? null;
}

function searchRowWorthConfirming(raw: Record<string, unknown>, input: AttendeeMatchInput): boolean {
  if (!resolveApolloPersonId(raw)) return false;
  const wanted = nameTokens(input.name)[0];
  const shown = nameTokens(String(raw.first_name ?? personDisplayName(raw)))[0];
  const sameFirst =
    Boolean(wanted && shown) &&
    (wanted === shown || (wanted.length >= 4 && (shown.startsWith(wanted) || wanted.startsWith(shown))));
  if (!sameFirst) return false;

  const company = input.company?.trim() ?? "";
  const org = personOrgName(raw);
  if (company && org && !companyFits(org, company)) return false;

  const masked = String(raw.last_name_obfuscated ?? "");
  if (masked.includes("*")) {
    return obfuscatedSurnamesFit(nameTokens(input.name).slice(1), masked);
  }
  if (raw.name || raw.last_name) return nameScore(input.name, personDisplayName(raw)) >= MIN_NAME_SCORE;
  return Boolean(company && org);
}

function fatalIdentifyError(message: string | undefined): boolean {
  return Boolean(
    message &&
      /cr[eé]dito|presupuesto|insufficient credits|rate limit|l[ií]mite de solicitudes|master/i.test(message)
  );
}

export async function matchAttendeeContact(
  input: AttendeeMatchInput,
  ownerId: number
): Promise<AttendeeMatchResult> {
  const deadlineMs = Date.now() + TIME_BUDGET_MS;
  const portfolioIds = await getPortfolioApolloIds(ownerId);
  const blocked = await getNoContestaContacts(ownerId);

  let identifyCredits = 0;
  const seen: Record<string, unknown>[] = [];

  const remember = async (detail: Record<string, unknown>) => {
    if (Date.now() >= deadlineMs) return;
    const identified = await identifyPersonByAttributes(detail);
    identifyCredits += identified.credits;
    if (fatalIdentifyError(identified.error)) throw new Error(identified.error);
    if (identified.person) seen.push(identified.person);
  };

  const detail = buildIdentifyDetail(input);
  await remember(detail);

  if (!pickAttendeeCandidate(seen, input) && input.company?.trim() && Date.now() < deadlineMs) {
    try {
      const brand = companySearchHint(input.company) || input.company;
      const orgs = await searchApolloOrganizations(brand);
      const domain = orgs
        .filter((org) => companyFits(org.name, input.company ?? "") || companyFits(org.name, brand))
        .map((org) => employerDomain(org.domain ?? ""))
        .find(Boolean);
      if (domain) {
        const withDomain: Record<string, unknown> = { ...detail, domain };
        delete withDomain.organization_name;
        await remember(withDomain);
      }
    } catch (e) {
      if (e instanceof ApolloApiError && fatalIdentifyError(e.message)) throw e;
    }
  }

  if (!pickAttendeeCandidate(seen, input) && detail.organization_name && Date.now() < deadlineMs) {
    const withoutOrg = { ...detail };
    delete withoutOrg.organization_name;
    await remember(withoutOrg);
  }

  const identifiedPick = pickAttendeeCandidate(seen, input);
  const locations = locationsOf(input);
  if (
    !identifiedPick &&
    seen.length &&
    locations.length &&
    seen.some(
      (person) =>
        nameScore(input.name, personDisplayName(person)) >= MIN_NAME_SCORE &&
        !matchesSelectedCountry(person, locations)
    )
  ) {
    if (identifyCredits > 0) {
      await recordProspeccionCredits(identifyCredits, 0, "search", ownerId);
    }
    return { status: "not_found", person: null, credits_consumed: identifyCredits };
  }

  if (!identifiedPick) {
    let confirmed = 0;
    for (const payload of buildAttendeeSearchPayloads(input)) {
      if (Date.now() >= deadlineMs || confirmed >= 3) break;
      const page = await searchPeopleCandidates(payload);
      for (const raw of page) {
        if (Date.now() >= deadlineMs || confirmed >= 3) break;
        if (!searchRowWorthConfirming(raw, input)) continue;
        confirmed += 1;
        await remember({ id: resolveApolloPersonId(raw) });
        if (pickAttendeeCandidate(seen, input)) break;
      }
      if (pickAttendeeCandidate(seen, input)) break;
    }
  }

  const unique = new Map<string, Record<string, unknown>>();
  for (const raw of seen) {
    const id = resolveApolloPersonId(raw);
    if (id && !unique.has(id)) unique.set(id, raw);
  }

  const candidate = pickAttendeeCandidate([...unique.values()], input);
  if (!candidate) {
    if (identifyCredits > 0) {
      await recordProspeccionCredits(identifyCredits, 0, "search", ownerId);
    }
    return { status: "not_found", person: null, credits_consumed: identifyCredits };
  }

  const id = resolveApolloPersonId(candidate);
  if (portfolioIds.has(id)) {
    if (identifyCredits > 0) {
      await recordProspeccionCredits(identifyCredits, 0, "search", ownerId);
    }
    const saved = await getLeadByApolloId(id, ownerId);
    const person: ApolloPerson | null = saved
      ? {
          apollo_id: saved.apollo_id,
          nombre: saved.nombre,
          cargo: saved.cargo,
          empresa: saved.empresa,
          email: saved.email,
          telefono: saved.telefono,
          pais: saved.pais,
          linkedin_url: saved.linkedin_url,
        }
      : null;
    return { status: "found", person, credits_consumed: identifyCredits, already_saved: true };
  }

  if (!isContactableInSearch(candidate)) {
    if (identifyCredits > 0) {
      await recordProspeccionCredits(identifyCredits, 0, "search", ownerId);
    }
    return { status: "no_contacts", person: null, credits_consumed: identifyCredits };
  }

  const enriched = await enrichSinglePersonWithContacts(candidate, { deadlineMs });
  const creditsConsumed = identifyCredits + enriched.stats.credits_consumed;
  if (creditsConsumed > 0) {
    await recordProspeccionCredits(creditsConsumed, enriched.person ? 1 : 0, "search", ownerId);
  }

  if (!enriched.person) {
    return { status: "no_contacts", person: null, credits_consumed: creditsConsumed };
  }
  if (isNoContestaContact(enriched.person, blocked)) {
    return { status: "no_contacts", person: null, credits_consumed: creditsConsumed };
  }
  if (!enriched.person.email?.trim() || !enriched.person.telefono?.trim()) {
    return { status: "no_contacts", person: null, credits_consumed: creditsConsumed };
  }

  return {
    status: "found",
    person: enriched.person,
    credits_consumed: creditsConsumed,
  };
}

export { ApolloApiError };
