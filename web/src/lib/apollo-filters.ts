/** Valores alineados con los filtros de Apollo — solo opciones de estas listas. */

export const APOLLO_COUNTRIES = [
  { label: "Colombia", value: "Colombia" },
  { label: "México", value: "Mexico" },
  { label: "Brasil", value: "Brazil" },
  { label: "Argentina", value: "Argentina" },
  { label: "Chile", value: "Chile" },
  { label: "Perú", value: "Peru" },
  { label: "Ecuador", value: "Ecuador" },
  { label: "Panamá", value: "Panama" },
  { label: "Estados Unidos", value: "United States" },
  { label: "España", value: "Spain" },
] as const;

export const APOLLO_JOB_TITLES = [
  { label: "Director de TI / IT Director", value: "IT Director" },
  { label: "Director de Tecnología", value: "Director of Technology" },
  { label: "Director de Sistemas", value: "Director of Information Technology" },
  { label: "CTO", value: "CTO" },
  { label: "CIO", value: "CIO" },
  { label: "VP de Ingeniería", value: "VP of Engineering" },
  { label: "Jefe de TI", value: "Head of IT" },
  { label: "Gerente de TI", value: "IT Manager" },
  { label: "CEO", value: "CEO" },
  { label: "Director General", value: "Managing Director" },
  { label: "Director", value: "Director" },
  { label: "Gerente General", value: "General Manager" },
] as const;

export const APOLLO_KEYWORDS = [
  { label: "Todas las industrias", value: "" },
  { label: "Construcción", value: "construction" },
  { label: "Software / Tecnología", value: "software" },
  { label: "Manufactura", value: "manufacturing" },
  { label: "Servicios financieros", value: "financial services" },
  { label: "Salud", value: "healthcare" },
  { label: "Retail / Comercio", value: "retail" },
  { label: "Logística", value: "logistics" },
  { label: "Telecomunicaciones", value: "telecommunications" },
  { label: "Energía", value: "energy" },
  { label: "Educación", value: "education" },
] as const;

export const APOLLO_SENIORITIES = [
  { label: "Cualquier nivel", value: "" },
  { label: "C-Suite", value: "c_suite" },
  { label: "VP", value: "vp" },
  { label: "Director", value: "director" },
  { label: "Head", value: "head" },
  { label: "Manager", value: "manager" },
] as const;

export const APOLLO_PER_PAGE_OPTIONS = [5, 10, 15, 20, 25] as const;

export const DEFAULT_SEARCH = {
  country: "Colombia",
  titles: ["IT Director"] as string[],
  keyword: "",
  seniority: "",
  perPage: 10,
};

const COUNTRY_VALUES = new Set(APOLLO_COUNTRIES.map((c) => c.value));
const TITLE_VALUES = new Set(APOLLO_JOB_TITLES.map((t) => t.value));
const KEYWORD_VALUES = new Set(APOLLO_KEYWORDS.map((k) => k.value));
const SENIORITY_VALUES = new Set(APOLLO_SENIORITIES.map((s) => s.value));

export interface ValidatedSearchRequest {
  person_locations: string[];
  person_titles: string[];
  person_seniorities: string[];
  q_keywords: string;
  page: number;
  per_page: number;
}

export function validateSearchRequest(body: Record<string, unknown>): ValidatedSearchRequest {
  const locs = body.person_locations;
  const country = String(
    body.country ?? (Array.isArray(locs) ? locs[0] : "") ?? ""
  );
  if (!COUNTRY_VALUES.has(country as (typeof APOLLO_COUNTRIES)[number]["value"])) {
    throw new Error("País no válido. Selecciona una opción de la lista.");
  }

  const rawTitles = Array.isArray(body.person_titles)
    ? body.person_titles
    : Array.isArray(body.titles)
      ? body.titles
      : [];
  const titles = rawTitles.map(String).filter((t) => TITLE_VALUES.has(t as never));
  if (!titles.length) {
    throw new Error("Selecciona al menos un cargo de la lista.");
  }

  const keyword = String(body.q_keywords ?? body.keyword ?? "");
  if (!KEYWORD_VALUES.has(keyword as never)) {
    throw new Error("Industria no válida. Selecciona una opción de la lista.");
  }

  const seniorityList = Array.isArray(body.person_seniorities)
    ? body.person_seniorities
    : [];
  const seniority = String(body.seniority ?? seniorityList[0] ?? "");
  if (seniority && !SENIORITY_VALUES.has(seniority as never)) {
    throw new Error("Seniority no válido. Selecciona una opción de la lista.");
  }

  const perPage = Number(body.per_page ?? DEFAULT_SEARCH.perPage);
  if (!APOLLO_PER_PAGE_OPTIONS.includes(perPage as (typeof APOLLO_PER_PAGE_OPTIONS)[number])) {
    throw new Error("Cantidad de resultados no válida.");
  }

  const page = Math.max(1, Number(body.page ?? 1));

  return {
    person_locations: [country],
    person_titles: titles,
    person_seniorities: seniority ? [seniority] : [],
    q_keywords: keyword,
    page,
    per_page: perPage,
  };
}
