import type { ApolloPerson } from "./types";
import type { ValidatedSearchRequest } from "./apollo-filters";
import { getIndustrySearchStrategies } from "./apollo-filters";
import {
  enrichPeopleWithContacts,
  isApolloWebhookConfigured,
} from "./apollo-enrich";
import { recordProspeccionCredits } from "./db";

const BASE_URL =
  process.env.APOLLO_BASE_URL ?? "https://api.apollo.io/api/v1";
const SEARCH_URL = `${BASE_URL}/mixed_people/api_search`;
const TIME_BUDGET_MS = 55000;

function maxProfilesToScan(target: number) {
  return Math.min(50, Math.max(target * 5, 20));
}

function headers() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error("APOLLO_API_KEY no configurada");
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "x-api-key": key,
  };
}

function buildSearchPayload(
  input: ValidatedSearchRequest,
  page: number,
  industryOverride?: Record<string, unknown>
) {
  const payload: Record<string, unknown> = {
    page,
    per_page: input.per_page,
    contact_email_status: ["verified", "likely to engage"],
    person_locations: input.person_locations,
    person_titles: input.person_titles,
  };

  if (input.person_seniorities.length) {
    payload.person_seniorities = input.person_seniorities;
  }

  if (industryOverride) {
    Object.assign(payload, industryOverride);
  } else if (input.q_keywords) {
    payload.q_keywords = input.q_keywords;
  }

  return payload;
}

function totalFromData(data: Record<string, unknown>) {
  const pagination = data.pagination as { total_entries?: number } | undefined;
  return (
    (data.total_entries as number | undefined) ??
    pagination?.total_entries ??
    0
  );
}

async function postSearch(payload: Record<string, unknown>) {
  const res = await fetch(SEARCH_URL, {
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
    if (res.status === 403 && text.includes("master")) {
      throw new ApolloApiError(
        "Tu API key debe ser Master API Key en Apollo → Settings → API.",
        403
      );
    }
    throw new ApolloApiError(`Apollo ${res.status}: ${text}`, res.status);
  }

  return res.json() as Promise<Record<string, unknown>>;
}

async function fetchSearchPage(
  input: ValidatedSearchRequest,
  page: number
): Promise<{ data: Record<string, unknown>; industry_relaxed: boolean }> {
  const strategies = input.q_keywords
    ? [
        buildSearchPayload(input, page),
        ...getIndustrySearchStrategies(input.q_keywords).map((override) =>
          buildSearchPayload(input, page, override)
        ),
      ]
    : [buildSearchPayload(input, page)];

  const seen = new Set<string>();
  let lastData: Record<string, unknown> = { people: [], total_entries: 0 };

  for (const payload of strategies) {
    const key = JSON.stringify(payload);
    if (seen.has(key)) continue;
    seen.add(key);

    const data = await postSearch(payload);
    lastData = data;
    if (totalFromData(data) > 0) {
      const usedDefault =
        JSON.stringify(payload) === JSON.stringify(buildSearchPayload(input, page));
      return { data, industry_relaxed: !usedDefault && Boolean(input.q_keywords) };
    }
  }

  return { data: lastData, industry_relaxed: false };
}

export async function searchApolloWithContacts(input: ValidatedSearchRequest) {
  const target = input.per_page;
  const collected: ApolloPerson[] = [];
  const seen = new Set<string>();
  let totalEntries = 0;
  let lastPage = input.page;
  let scanned = 0;
  let industryRelaxed = false;
  const started = Date.now();
  let enrichStats = {
    candidates: 0,
    matched: 0,
    with_email: 0,
    with_phone: 0,
    with_both: 0,
    credits_consumed: 0,
    match_errors: [] as string[],
  };

  const maxScan = maxProfilesToScan(target);

  for (
    let page = input.page;
    page < input.page + 10 && collected.length < target && scanned < maxScan;
    page++
  ) {
    if (Date.now() - started > TIME_BUDGET_MS) break;

    const { data, industry_relaxed } = await fetchSearchPage(input, page);
    if (industry_relaxed) industryRelaxed = true;

    const raw = (data.people ?? data.contacts ?? []) as Record<string, unknown>[];
    totalEntries = totalFromData(data) || totalEntries;
    lastPage = page;
    scanned += raw.length;

    if (!raw.length) break;

    const enriched = await enrichPeopleWithContacts(raw);
    enrichStats = {
      candidates: enrichStats.candidates + enriched.stats.candidates,
      matched: enrichStats.matched + enriched.stats.matched,
      with_email: enrichStats.with_email + enriched.stats.with_email,
      with_phone: enrichStats.with_phone + enriched.stats.with_phone,
      with_both: enrichStats.with_both + enriched.stats.with_both,
      credits_consumed:
        enrichStats.credits_consumed + enriched.stats.credits_consumed,
      match_errors: [
        ...new Set([...enrichStats.match_errors, ...enriched.stats.match_errors]),
      ],
    };
    for (const person of enriched.results) {
      if (collected.length >= target) break;
      if (seen.has(person.apollo_id)) continue;
      if (!person.email || !person.telefono) continue;
      seen.add(person.apollo_id);
      collected.push(person);
    }

    const totalPages =
      (data.pagination as { total_pages?: number } | undefined)?.total_pages ??
      Math.ceil(totalEntries / input.per_page);
    if (page >= totalPages) break;
  }

  if (enrichStats.credits_consumed > 0) {
    await recordProspeccionCredits(
      enrichStats.credits_consumed,
      collected.length,
      "search"
    );
  } else if (scanned > 0) {
    await recordProspeccionCredits(0, collected.length, "search");
  }

  return {
    results: collected,
    meta: {
      page: lastPage,
      per_page: target,
      total_entries: totalEntries,
      total_pages: Math.max(1, Math.ceil(totalEntries / input.per_page)),
      scanned_profiles: scanned,
      with_contact_data: collected.length,
      enrich_stats: enrichStats,
      credits_consumed: enrichStats.credits_consumed,
      industry_relaxed: industryRelaxed,
      apollo_zero_results: totalEntries === 0 && scanned === 0,
      webhook_configured: isApolloWebhookConfigured(),
      match_errors: enrichStats.match_errors,
    },
  };
}

export class ApolloApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApolloApiError";
  }
}
