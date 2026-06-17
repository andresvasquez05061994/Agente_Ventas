import type { ApolloPerson } from "./types";

/** Uso interno del equipo — respeta límites del plan Apollo (ToS §4). */
const BASE_URL =
  process.env.APOLLO_BASE_URL ?? "https://api.apollo.io/api/v1";
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

function extractPhone(raw: Record<string, unknown>): string | null {
  const numbers = raw.phone_numbers as Array<Record<string, string>> | undefined;
  if (numbers?.length) {
    return numbers[0].sanitized_number ?? numbers[0].raw_number ?? null;
  }
  return (raw.sanitized_phone as string) ?? (raw.phone as string) ?? null;
}

function normalize(raw: Record<string, unknown>): ApolloPerson {
  const org = (raw.organization as Record<string, string>) ?? {};
  const first = (raw.first_name as string) ?? "";
  const last = (raw.last_name as string) ?? "";
  return {
    apollo_id: (raw.id as string) ?? (raw.person_id as string) ?? "",
    nombre: (raw.name as string) ?? `${first} ${last}`.trim(),
    cargo: (raw.title as string) ?? (raw.headline as string) ?? null,
    empresa: org.name ?? null,
    email: (raw.email as string) ?? null,
    telefono: extractPhone(raw),
    pais: (raw.country as string) ?? (raw.present_raw_address as string) ?? null,
    linkedin_url: (raw.linkedin_url as string) ?? null,
  };
}

export async function searchApollo(params: {
  pais: string;
  cargo: string;
  keywords: string;
  page?: number;
  per_page?: number;
}) {
  const titles = params.cargo.split(",").map((t) => t.trim()).filter(Boolean);
  const tags = params.keywords.split(",").map((k) => k.trim()).filter(Boolean);

  const perPage = Math.min(
    Math.max(params.per_page ?? MAX_PER_PAGE, 1),
    MAX_PER_PAGE
  );

  const payload: Record<string, unknown> = {
    person_locations: params.pais ? [params.pais] : [],
    person_titles: titles,
    page: params.page ?? 1,
    per_page: perPage,
  };
  if (tags.length) payload.q_organization_keyword_tags = tags;
  else if (params.keywords.trim()) payload.q_keywords = params.keywords.trim();

  const endpoints = [
    `${BASE_URL}/mixed_people/search`,
    `${BASE_URL}/mixed_people/api_search`,
  ];

  for (const url of endpoints) {
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
    if (res.ok) {
      const data = await res.json();
      const raw = (data.contacts ?? data.people ?? []) as Record<
        string,
        unknown
      >[];
      const pagination = data.pagination ?? {};
      return {
        results: raw.map(normalize).filter((p) => p.apollo_id),
        meta: {
          page: pagination.page ?? params.page ?? 1,
          per_page: pagination.per_page ?? perPage,
          total_entries: pagination.total_entries ?? raw.length,
          total_pages: pagination.total_pages ?? 1,
        },
      };
    }
    if (res.status !== 403) {
      throw new ApolloApiError(
        `Apollo ${res.status}: ${await res.text()}`,
        res.status
      );
    }
  }
  throw new ApolloApiError(
    "No se pudo conectar con Apollo. Revisa tu API key y plan.",
    403
  );
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
