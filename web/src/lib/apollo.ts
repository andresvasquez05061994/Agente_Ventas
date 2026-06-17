import type { ApolloPerson } from "./types";

/** Uso interno del equipo — respeta límites del plan Apollo (ToS §4). */
const BASE_URL =
  process.env.APOLLO_BASE_URL ?? "https://api.apollo.io/api/v1";
const SEARCH_URL = `${BASE_URL}/mixed_people/api_search`;
const MAX_PER_PAGE = 25;

export interface ApolloSearchInput {
  person_locations?: string[];
  person_titles?: string[];
  person_seniorities?: string[];
  q_keywords?: string;
  page?: number;
  per_page?: number;
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

function buildDisplayName(raw: Record<string, unknown>): string {
  if (typeof raw.name === "string" && raw.name.trim()) return raw.name.trim();
  const first = (raw.first_name as string) ?? "";
  const last =
    (raw.last_name as string) ??
    (raw.last_name_obfuscated as string) ??
    "";
  return `${first} ${last}`.trim() || "Sin nombre";
}

function normalize(raw: Record<string, unknown>): ApolloPerson {
  const org = (raw.organization as Record<string, string>) ?? {};
  return {
    apollo_id: String(raw.id ?? raw.person_id ?? ""),
    nombre: buildDisplayName(raw),
    cargo: (raw.title as string) ?? (raw.headline as string) ?? null,
    empresa: org.name ?? null,
    email: (raw.email as string) ?? null,
    telefono: null,
    pais: (raw.country as string) ?? (raw.present_raw_address as string) ?? null,
    linkedin_url: (raw.linkedin_url as string) ?? null,
  };
}

function buildSearchPayload(input: ApolloSearchInput, page: number, perPage: number) {
  const locations = (input.person_locations ?? []).map((l) => l.trim()).filter(Boolean);
  const titles = (input.person_titles ?? []).map((t) => t.trim()).filter(Boolean);
  const seniorities = (input.person_seniorities ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  const keywords = input.q_keywords?.trim() ?? "";

  if (!locations.length && !titles.length && !keywords && !seniorities.length) {
    throw new ApolloApiError(
      "Selecciona al menos un filtro: país, cargo, industria o seniority.",
      400
    );
  }

  const payload: Record<string, unknown> = {
    page,
    per_page: perPage,
  };

  if (locations.length) payload.person_locations = locations;
  if (titles.length) payload.person_titles = titles;
  if (seniorities.length) payload.person_seniorities = seniorities;
  if (keywords) payload.q_keywords = keywords;

  return payload;
}

export async function searchApollo(input: ApolloSearchInput) {
  const page = input.page ?? 1;
  const perPage = Math.min(
    Math.max(input.per_page ?? MAX_PER_PAGE, 1),
    MAX_PER_PAGE
  );
  const payload = buildSearchPayload(input, page, perPage);

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
        "Tu API key de Apollo debe ser una Master API Key para usar búsquedas. Revísala en Apollo → Settings → API.",
        403
      );
    }
    throw new ApolloApiError(`Apollo ${res.status}: ${text}`, res.status);
  }

  const data = await res.json();
  const raw = (data.people ?? data.contacts ?? []) as Record<string, unknown>[];
  const totalEntries =
    data.total_entries ?? data.pagination?.total_entries ?? raw.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / perPage));

  return {
    results: raw.map(normalize).filter((p) => p.apollo_id),
    meta: {
      page: data.pagination?.page ?? page,
      per_page: data.pagination?.per_page ?? perPage,
      total_entries: totalEntries,
      total_pages: data.pagination?.total_pages ?? totalPages,
    },
    debug: process.env.NODE_ENV === "development" ? { payload } : undefined,
  };
}

/** Compatibilidad con campos de texto libre (legacy). */
export async function searchApolloLegacy(params: {
  pais: string;
  cargo: string;
  keywords: string;
  page?: number;
  per_page?: number;
}) {
  const titles = params.cargo.split(",").map((t) => t.trim()).filter(Boolean);
  const keywordParts = params.keywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  return searchApollo({
    person_locations: params.pais ? [params.pais] : [],
    person_titles: titles,
    q_keywords:
      keywordParts.length > 1
        ? keywordParts.join(" ")
        : keywordParts[0] ?? "",
    page: params.page,
    per_page: params.per_page,
  });
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
