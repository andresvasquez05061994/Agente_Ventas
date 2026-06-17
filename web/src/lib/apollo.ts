import type { ApolloPerson } from "./types";
import type { ValidatedSearchRequest } from "./apollo-filters";
import {
  enrichPeopleWithContacts,
  normalizePerson,
} from "./apollo-enrich";

const BASE_URL =
  process.env.APOLLO_BASE_URL ?? "https://api.apollo.io/api/v1";
const SEARCH_URL = `${BASE_URL}/mixed_people/api_search`;
const MAX_SEARCH_PAGES = 3;
const TIME_BUDGET_MS = 50000;

function headers() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error("APOLLO_API_KEY no configurada");
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "x-api-key": key,
  };
}

function buildSearchPayload(input: ValidatedSearchRequest, page: number) {
  const payload: Record<string, unknown> = {
    page,
    per_page: input.per_page,
    contact_email_status: ["verified", "likely to engage"],
  };

  if (input.person_locations.length) {
    payload.person_locations = input.person_locations;
  }
  if (input.person_titles.length) {
    payload.person_titles = input.person_titles;
  }
  if (input.person_seniorities.length) {
    payload.person_seniorities = input.person_seniorities;
  }
  if (input.q_keywords) {
    payload.q_keywords = input.q_keywords;
  }

  return payload;
}

async function fetchSearchPage(input: ValidatedSearchRequest, page: number) {
  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(buildSearchPayload(input, page)),
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

  return res.json();
}

export async function searchApolloWithContacts(input: ValidatedSearchRequest) {
  const target = input.per_page;
  const collected: ApolloPerson[] = [];
  const seen = new Set<string>();
  let totalEntries = 0;
  let lastPage = input.page;
  let scanned = 0;
  const started = Date.now();

  for (
    let page = input.page;
    page < input.page + MAX_SEARCH_PAGES && collected.length < target;
    page++
  ) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const data = await fetchSearchPage(input, page);
    const raw = (data.people ?? data.contacts ?? []) as Record<string, unknown>[];
    totalEntries = data.total_entries ?? data.pagination?.total_entries ?? totalEntries;
    lastPage = page;
    scanned += raw.length;

    if (!raw.length) break;

    const enriched = await enrichPeopleWithContacts(raw);
    for (const person of enriched) {
      if (collected.length >= target) break;
      if (seen.has(person.apollo_id)) continue;
      if (!person.email || !person.telefono) continue;
      seen.add(person.apollo_id);
      collected.push(person);
    }

    const totalPages = data.pagination?.total_pages ?? Math.ceil(totalEntries / input.per_page);
    if (page >= totalPages) break;
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

// Re-export for tests
export { normalizePerson };
