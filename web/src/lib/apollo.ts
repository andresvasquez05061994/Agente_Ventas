import type { ApolloPerson } from "./types";

/** Uso interno del equipo — respeta límites del plan Apollo (ToS §4). */
const BASE_URL =
  process.env.APOLLO_BASE_URL ?? "https://api.apollo.io/api/v1";
const SEARCH_URL = `${BASE_URL}/mixed_people/api_search`;
const MAX_PER_PAGE = 25;

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
  return `${first} ${last}`.trim();
}

function normalize(raw: Record<string, unknown>): ApolloPerson {
  const org = (raw.organization as Record<string, string>) ?? {};
  return {
    apollo_id: (raw.id as string) ?? (raw.person_id as string) ?? "",
    nombre: buildDisplayName(raw),
    cargo: (raw.title as string) ?? (raw.headline as string) ?? null,
    empresa: org.name ?? null,
    // api_search no devuelve email/teléfono; requiere enrichment posterior.
    email: (raw.email as string) ?? null,
    telefono: null,
    pais: (raw.country as string) ?? (raw.present_raw_address as string) ?? null,
    linkedin_url: (raw.linkedin_url as string) ?? null,
  };
}

function buildSearchPayload(params: {
  pais: string;
  cargo: string;
  keywords: string;
  page: number;
  perPage: number;
}) {
  const titles = params.cargo.split(",").map((t) => t.trim()).filter(Boolean);
  const keywordParts = params.keywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const payload: Record<string, unknown> = {
    person_locations: params.pais ? [params.pais] : [],
    person_titles: titles,
    page: params.page,
    per_page: params.perPage,
  };

  if (keywordParts.length === 1) {
    payload.q_keywords = keywordParts[0];
  } else if (keywordParts.length > 1) {
    payload.q_keywords = keywordParts.join(" ");
  }

  return payload;
}

export async function searchApollo(params: {
  pais: string;
  cargo: string;
  keywords: string;
  page?: number;
  per_page?: number;
}) {
  const page = params.page ?? 1;
  const perPage = Math.min(
    Math.max(params.per_page ?? MAX_PER_PAGE, 1),
    MAX_PER_PAGE
  );
  const payload = buildSearchPayload({
    pais: params.pais,
    cargo: params.cargo,
    keywords: params.keywords,
    page,
    perPage,
  });

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
    throw new ApolloApiError(
      `Apollo ${res.status}: ${await res.text()}`,
      res.status
    );
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
