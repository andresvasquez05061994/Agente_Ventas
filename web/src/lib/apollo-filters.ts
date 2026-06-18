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
  { label: "Todas las industrias", value: "", searchTerms: [] as string[] },
  { label: "Construcción", value: "construction", searchTerms: ["construction", "building materials"] },
  { label: "Software / Tecnología", value: "software", searchTerms: ["software", "technology", "saas"] },
  { label: "Manufactura", value: "manufacturing", searchTerms: ["manufacturing", "industrial", "machinery", "manufacturer"] },
  { label: "Servicios financieros", value: "financial services", searchTerms: ["financial services", "banking", "fintech"] },
  { label: "Salud", value: "healthcare", searchTerms: ["healthcare", "hospital", "medical"] },
  { label: "Retail / Comercio", value: "retail", searchTerms: ["retail", "commerce", "consumer goods"] },
  { label: "Logística", value: "logistics", searchTerms: ["logistics", "transportation", "supply chain"] },
  { label: "Telecomunicaciones", value: "telecommunications", searchTerms: ["telecommunications", "telecom"] },
  { label: "Energía", value: "energy", searchTerms: ["energy", "oil", "utilities"] },
  { label: "Educación", value: "education", searchTerms: ["education", "university", "edtech"] },
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
  company: "",
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
  organization_name: string;
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

  const company = String(body.company ?? body.organization_name ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
  if (company && !/^[\w\s.&'´\-áéíóúñÁÉÍÓÚÑ]+$/u.test(company)) {
    throw new Error("Nombre de empresa con caracteres no permitidos.");
  }

  return {
    person_locations: [country],
    person_titles: titles,
    person_seniorities: seniority ? [seniority] : [],
    q_keywords: keyword,
    organization_name: company,
    page,
    per_page: perPage,
  };
}

/** Estrategias de industria para cuando q_keywords no devuelve resultados en Apollo. */
export function getIndustrySearchStrategies(
  keyword: string
): Array<Record<string, unknown>> {
  if (!keyword) return [{}];

  const item = APOLLO_KEYWORDS.find((k) => k.value === keyword);
  const terms = item?.searchTerms?.length ? [...item.searchTerms] : [keyword];

  const strategies: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  for (const term of terms) {
    const kw = { q_keywords: term };
    const tag = { q_organization_keyword_tags: [term] };
    const kwKey = JSON.stringify(kw);
    const tagKey = JSON.stringify(tag);
    if (!seen.has(kwKey)) {
      seen.add(kwKey);
      strategies.push(kw);
    }
    if (!seen.has(tagKey)) {
      seen.add(tagKey);
      strategies.push(tag);
    }
  }

  return strategies.slice(0, 6);
}

export interface SearchEmptyMeta {
  scanned_profiles?: number;
  total_entries?: number;
  apollo_zero_results?: boolean;
  webhook_configured?: boolean;
  organization_name?: string;
  match_errors?: string[];
  enrich_stats?: {
    candidates?: number;
    matched?: number;
    with_email?: number;
    with_phone?: number;
    with_both?: number;
    credits_consumed?: number;
  };
}

function humanizeApolloError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("insufficient credits")) {
    return "Sin créditos Apollo disponibles. Recarga tu plan en app.apollo.io → Settings → Plans y vuelve a buscar.";
  }
  if (lower.includes("master")) {
    return "La API key debe ser Master en Apollo → Settings → API.";
  }
  if (lower.includes("429") || lower.includes("rate limit")) {
    return "Límite de solicitudes Apollo alcanzado. Espera un minuto e intenta de nuevo.";
  }
  try {
    const jsonStart = raw.indexOf("{");
    if (jsonStart >= 0) {
      const parsed = JSON.parse(raw.slice(jsonStart)) as { error?: string };
      if (parsed.error) {
        const clean = parsed.error.replace(/<[^>]*>/g, "").trim();
        if (clean.toLowerCase().includes("insufficient credits")) {
          return "Sin créditos Apollo disponibles. Recarga tu plan en app.apollo.io → Settings → Plans y vuelve a buscar.";
        }
        return clean;
      }
    }
  } catch {
    /* ignore */
  }
  return raw.replace(/^Apollo bulk_match \d+: /, "").slice(0, 280);
}

/** Mensaje contextual cuando la búsqueda no devuelve contactos completos. */
export function explainEmptySearchMessage(
  meta: SearchEmptyMeta | null | undefined,
  hasSeniorityFilter: boolean
): string {
  if (!meta) {
    return "No se encontraron contactos con email y teléfono. Ajusta los filtros e intenta de nuevo.";
  }

  const scanned = meta.scanned_profiles ?? 0;
  const total = meta.total_entries ?? 0;
  const stats = meta.enrich_stats;
  const apolloError = meta.match_errors?.[0];

  if (apolloError) {
    return humanizeApolloError(apolloError);
  }

  if (meta.apollo_zero_results) {
    return (
      "Apollo no tiene perfiles para esta combinación (país + cargos + industria" +
      (meta.organization_name ? " + empresa" : "") +
      "). Prueba «Todas las industrias» u otra como Software o Salud."
    );
  }

  if (scanned === 0) {
    return "No se encontraron contactos con email y teléfono. Ajusta los filtros e intenta de nuevo.";
  }

  if (stats && stats.candidates === 0) {
    return (
      `Apollo devolvió ${scanned} perfiles (${total} coincidencias) pero ninguno indicaba email disponible. ` +
      "Prueba más cargos o cambia la industria."
    );
  }

  if (stats && (stats.with_email ?? 0) > 0 && (stats.with_both ?? 0) === 0) {
    if (!meta.webhook_configured) {
      return (
        `Se obtuvo email en ${stats.with_email} perfil(es), pero no teléfono: ` +
        "configura APOLLO_WEBHOOK_BASE_URL=https://agente-ventas-three.vercel.app en Vercel."
      );
    }
    return (
      `${stats.with_email} perfil(es) con email pero ninguno con teléfono en el tiempo de espera. ` +
      "Prueba de nuevo o selecciona cargos con mayor cobertura móvil en Apollo."
    );
  }

  if (stats && (stats.candidates ?? 0) > 0 && (stats.matched ?? 0) === 0) {
    if ((stats.credits_consumed ?? 0) === 0) {
      return (
        `Apollo no enriqueció ${stats.candidates} candidatos (0 créditos usados). ` +
        "Verifica que la API key sea Master y que tengas créditos en Apollo."
      );
    }
    return (
      `Apollo procesó ${stats.candidates} candidatos pero ninguno devolvió datos completos. ` +
      "Prueba más cargos o «Todas las industrias»."
    );
  }

  const hints = ["prueba más cargos", "usa «Todas las industrias»"];
  if (hasSeniorityFilter) hints.push("quita el filtro de seniority");

  return (
    `Se revisaron ${scanned} perfiles (${total} coincidencias) sin email y teléfono completos. ` +
    `${hints[0].charAt(0).toUpperCase() + hints[0].slice(1)}, ${hints.slice(1).join(" o ")}.`
  );
}
