import { ApolloApiError, searchPeopleCandidates } from "./apollo";
import {
  enrichSinglePersonWithContacts,
  isContactableInSearch,
  resolveApolloPersonId,
} from "./apollo-enrich";
import { organizationMatches, personMatchesCountry } from "./apollo-filters";
import { MIN_NAME_SCORE, nameScore, nameTokens } from "./excel-attendees";
import {
  getLeadByApolloId,
  getNoContestaContacts,
  getPortfolioApolloIds,
  isNoContestaContact,
  recordProspeccionCredits,
} from "./db";
import type { ApolloPerson } from "./types";

const TIME_BUDGET_MS = 48000;

export type AttendeeMatchStatus = "found" | "no_contacts" | "not_found";

export type AttendeeMatchInput = {
  name: string;
  title?: string;
  company?: string;
  country: string;
};

export type AttendeeMatchResult = {
  status: AttendeeMatchStatus;
  person: ApolloPerson | null;
  credits_consumed: number;
  already_saved?: boolean;
};

function lastNameOf(name: string): string {
  const tokens = nameTokens(name);
  return tokens.slice(1).join(" ") || tokens[0] || name;
}

function buildPayloads(input: AttendeeMatchInput): Record<string, unknown>[] {
  const title = input.title?.trim();
  const last = lastNameOf(input.name);
  const company = input.company?.trim();
  const base: Record<string, unknown> = {
    page: 1,
    per_page: 10,
    contact_email_status: ["verified", "likely to engage"],
    person_locations: [input.country],
    q_keywords: input.name,
  };
  if (company) base.q_organization_name = company;
  const payloads: Record<string, unknown>[] = [];
  if (title) {
    payloads.push({ ...base, person_titles: [title], q_keywords: input.name });
  }
  payloads.push({ ...base });
  if (last && last.toLowerCase() !== input.name.toLowerCase()) {
    payloads.push({ ...base, q_keywords: last });
  }
  return payloads;
}

function pickCandidate(
  people: Record<string, unknown>[],
  input: AttendeeMatchInput
): Record<string, unknown> | null {
  const company = input.company?.trim() ?? "";
  const minScore = company ? MIN_NAME_SCORE : 92;
  let best: { person: Record<string, unknown>; score: number } | null = null;
  for (const raw of people) {
    const id = resolveApolloPersonId(raw);
    if (!id) continue;
    const org = (raw.organization as { name?: string } | undefined)?.name ?? (raw.organization_name as string) ?? "";
    if (company && !organizationMatches(org, company)) continue;
    if (!personMatchesCountry(raw, input.country)) continue;
    const display =
      (typeof raw.name === "string" && raw.name) ||
      `${raw.first_name ?? ""} ${raw.last_name ?? raw.last_name_obfuscated ?? ""}`.trim();
    const score = nameScore(input.name, display);
    if (score < minScore) continue;
    if (!best || score > best.score) best = { person: raw, score };
  }
  return best?.person ?? null;
}

export async function matchAttendeeContact(
  input: AttendeeMatchInput,
  ownerId: number
): Promise<AttendeeMatchResult> {
  const deadlineMs = Date.now() + TIME_BUDGET_MS;
  const portfolioIds = await getPortfolioApolloIds(ownerId);
  const blocked = await getNoContestaContacts(ownerId);

  let seen: Record<string, unknown>[] = [];
  for (const payload of buildPayloads(input)) {
    if (Date.now() >= deadlineMs) break;
    const page = await searchPeopleCandidates(payload);
    seen = seen.concat(page);
    if (pickCandidate(page, input)) break;
  }

  const unique = new Map<string, Record<string, unknown>>();
  for (const raw of seen) {
    const id = resolveApolloPersonId(raw);
    if (id && !unique.has(id)) unique.set(id, raw);
  }

  const candidate = pickCandidate([...unique.values()], input);
  if (!candidate) {
    return { status: "not_found", person: null, credits_consumed: 0 };
  }

  const id = resolveApolloPersonId(candidate);
  if (portfolioIds.has(id)) {
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
    return { status: "found", person, credits_consumed: 0, already_saved: true };
  }

  if (!isContactableInSearch(candidate)) {
    return { status: "no_contacts", person: null, credits_consumed: 0 };
  }

  const enriched = await enrichSinglePersonWithContacts(candidate, { deadlineMs });
  if (enriched.stats.credits_consumed > 0) {
    await recordProspeccionCredits(
      enriched.stats.credits_consumed,
      enriched.person ? 1 : 0,
      "search",
      ownerId
    );
  }

  if (!enriched.person) {
    return { status: "no_contacts", person: null, credits_consumed: enriched.stats.credits_consumed };
  }
  if (isNoContestaContact(enriched.person, blocked)) {
    return { status: "no_contacts", person: null, credits_consumed: enriched.stats.credits_consumed };
  }
  if (!enriched.person.email?.trim() || !enriched.person.telefono?.trim()) {
    return { status: "no_contacts", person: null, credits_consumed: enriched.stats.credits_consumed };
  }

  return {
    status: "found",
    person: enriched.person,
    credits_consumed: enriched.stats.credits_consumed,
  };
}

export { ApolloApiError };
