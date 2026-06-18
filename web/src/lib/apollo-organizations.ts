import { ApolloApiError } from "./apollo";

const BASE_URL =
  process.env.APOLLO_BASE_URL ?? "https://api.apollo.io/api/v1";
const ORG_SEARCH_URL = `${BASE_URL}/mixed_companies/search`;

export type CompanySuggestion = {
  name: string;
  source: "apollo" | "portafolio";
  domain?: string | null;
  location?: string | null;
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

export async function searchApolloOrganizations(
  query: string,
  country?: string
): Promise<CompanySuggestion[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const payload: Record<string, unknown> = {
    page: 1,
    per_page: 10,
    q_organization_name: term,
  };
  if (country?.trim()) {
    payload.organization_locations = [country.trim()];
  }

  const res = await fetch(ORG_SEARCH_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });

  if (res.status === 429) {
    throw new ApolloApiError("Límite de Apollo alcanzado. Intenta en unos segundos.", 429);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new ApolloApiError(`Apollo organizations ${res.status}: ${text.slice(0, 180)}`, res.status);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const orgs = (data.organizations ?? data.accounts ?? []) as Array<
    Record<string, unknown>
  >;

  const results: CompanySuggestion[] = [];
  for (const org of orgs) {
    const name = String(org.name ?? "").trim();
    if (!name) continue;
    results.push({
      name,
      source: "apollo",
      domain:
        (org.primary_domain as string) ??
        (org.website_url as string) ??
        null,
      location:
        (org.primary_location as string) ??
        (org.country as string) ??
        null,
    });
  }
  return results;
}

export function mergeCompanySuggestions(
  apollo: CompanySuggestion[],
  portfolio: string[],
  query: string,
  limit = 8
): CompanySuggestion[] {
  const term = query.trim().toLowerCase();
  const seen = new Set<string>();
  const out: CompanySuggestion[] = [];

  const add = (item: CompanySuggestion) => {
    const key = item.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };

  for (const name of portfolio) {
    add({ name, source: "portafolio" });
  }

  for (const item of apollo) {
    add(item);
  }

  return out
    .sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aStarts = aName.startsWith(term) ? 0 : 1;
      const bStarts = bName.startsWith(term) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      if (a.source !== b.source) return a.source === "portafolio" ? -1 : 1;
      return aName.localeCompare(bName, "es");
    })
    .slice(0, limit);
}
