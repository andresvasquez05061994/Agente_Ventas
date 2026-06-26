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

/** Cargos orientados a automatización de procesos, IA y predicción de demanda. */
export const APOLLO_JOB_TITLES = [
  { label: "Director de Operaciones / COO", value: "Chief Operating Officer" },
  { label: "Director de Automatización", value: "Director of Automation" },
  { label: "Director de Innovación", value: "Director of Innovation" },
  { label: "Director de TI / IT Director", value: "IT Director" },
  { label: "CTO", value: "CTO" },
  { label: "CIO", value: "CIO" },
  { label: "Chief Data Officer (CDO)", value: "Chief Data Officer" },
  { label: "Director de Ciencia de Datos", value: "Director of Data Science" },
  { label: "Director de Analytics / BI", value: "Director of Analytics" },
  { label: "Director de IA", value: "Director of Artificial Intelligence" },
  { label: "VP Cadena de Suministro", value: "VP of Supply Chain" },
  { label: "Director de Planificación de Demanda", value: "Director of Demand Planning" },
] as const;

/** RRHH, logística, comercial y otras áreas. */
export const APOLLO_JOB_TITLES_OTHER = [
  { label: "CHRO / Director de RRHH", value: "Chief Human Resources Officer" },
  { label: "Director de Recursos Humanos", value: "Human Resources Director" },
  { label: "Director de Talento", value: "Director of Talent" },
  { label: "Director de Logística", value: "Director of Logistics" },
  { label: "Director de Transporte", value: "Director of Transportation" },
  { label: "Gerente de Logística", value: "Logistics Manager" },
  { label: "Director de Compras", value: "Director of Procurement" },
  { label: "Director Comercial / Ventas", value: "Sales Director" },
  { label: "Director de Marketing", value: "Marketing Director" },
  { label: "CFO / Director Financiero", value: "Chief Financial Officer" },
  { label: "CEO", value: "CEO" },
  { label: "Gerente General", value: "General Manager" },
] as const;

export const APOLLO_PRESET_JOB_TITLES = [...APOLLO_JOB_TITLES, ...APOLLO_JOB_TITLES_OTHER] as const;

const PRESET_TITLE_VALUES = new Set(APOLLO_PRESET_JOB_TITLES.map((t) => t.value));

export function sanitizeJobTitle(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

export function isValidJobTitle(title: string): boolean {
  const t = sanitizeJobTitle(title);
  return t.length >= 2 && /^[\w\s.&'´\-áéíóúñÁÉÍÓÚÑ()/]+$/u.test(t);
}

/** Normaliza y deduplica cargos (lista + personalizados). */
export function normalizeJobTitles(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const t = sanitizeJobTitle(r);
    if (!isValidJobTitle(t)) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export function isPresetJobTitle(value: string): boolean {
  return PRESET_TITLE_VALUES.has(value as (typeof APOLLO_PRESET_JOB_TITLES)[number]["value"]);
}

export function getAllPresetTitleValues(): string[] {
  return APOLLO_PRESET_JOB_TITLES.map((t) => t.value);
}

/** Normaliza nombre de empresa para comparación flexible. */
export function normalizeOrgName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** ¿El contacto pertenece a la empresa filtrada? (coincidencia parcial por tokens). */
export function organizationMatches(
  company: string | null | undefined,
  filter: string
): boolean {
  const f = normalizeOrgName(filter);
  if (!f) return true;
  const c = normalizeOrgName(company ?? "");
  if (!c) return false;
  if (c.includes(f) || f.includes(c)) return true;
  const tokens = f.split(" ").filter((t) => t.length >= 3);
  if (!tokens.length) return c.includes(f);
  return tokens.every((t) => c.includes(t));
}

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
  {
    label: "Agricultura / Agroexportación",
    value: "agriculture",
    searchTerms: ["agriculture", "agribusiness", "floral", "flowers", "horticulture", "farming", "crop"],
  },
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

/** Rangos de empleados Apollo (min,max sin espacios). */
export const APOLLO_EMPLOYEE_RANGES = [
  { label: "Cualquier tamaño", value: "" },
  { label: "Micro / pequeña (1-50)", value: "1,50" },
  { label: "Mediana (51-200)", value: "51,200" },
  { label: "Mediana (51-500)", value: "51,500" },
  { label: "Grande (501-5.000)", value: "501,5000" },
  { label: "Enterprise (5.000+)", value: "5001,10000" },
] as const;

const ALLOWED_EMPLOYEE_RANGE_VALUES = new Set<string>(
  APOLLO_EMPLOYEE_RANGES.map((r) => r.value).filter(Boolean)
);

export const DEFAULT_SEARCH = {
  country: "Colombia",
  titles: [] as string[],
  keyword: "",
  seniority: "",
  company: "",
  employeeRanges: [] as string[],
  perPage: 5,
};

const COUNTRY_VALUES = new Set(APOLLO_COUNTRIES.map((c) => c.value));
const KEYWORD_VALUES = new Set(APOLLO_KEYWORDS.map((k) => k.value));
const SENIORITY_VALUES = new Set(APOLLO_SENIORITIES.map((s) => s.value));

export interface ValidatedSearchRequest {
  person_locations: string[];
  person_titles: string[];
  person_seniorities: string[];
  q_keywords: string;
  organization_name: string;
  organization_num_employees_ranges: string[];
  page: number;
  per_page: number;
}

const COUNTRY_LOCATION_ALIASES: Record<string, string[]> = {
  Colombia: [
    "colombia",
    "bogota",
    "bogotá",
    "medellin",
    "medellín",
    "barranquilla",
    "cartagena",
    "antioquia",
    "cundinamarca",
    "santander",
    "valle del cauca",
    "bucaramanga",
    "pereira",
    "manizales",
    "cali",
  ],
  Mexico: ["mexico", "méxico", "cdmx", "guadalajara", "monterrey", "ciudad de mexico"],
  Brazil: ["brazil", "brasil", "sao paulo", "são paulo", "rio de janeiro"],
  Argentina: ["argentina", "buenos aires", "córdoba", "cordoba"],
  Chile: ["chile", "santiago de chile", "santiago, chile"],
  Peru: ["peru", "perú", "lima, peru", "lima peru"],
  Ecuador: ["ecuador", "quito", "guayaquil"],
  Panama: ["panama", "panamá", "ciudad de panama"],
  "United States": ["united states", "usa", "u.s.a", "new york", "california", "texas"],
  Spain: ["spain", "españa", "espana", "madrid", "barcelona"],
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textIncludesAlias(text: string, alias: string): boolean {
  const normalized = alias.trim();
  if (!normalized) return false;
  if (normalized.length <= 4 || normalized.includes(" ")) {
    return new RegExp(`\\b${escapeRegex(normalized)}\\b`, "i").test(text);
  }
  return text.includes(normalized);
}

function normalizeLocationText(value: string): string {
  return ` ${value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function collectPersonLocationText(raw: Record<string, unknown>): string {
  const org = raw.organization as Record<string, unknown> | undefined;
  const personLocations = Array.isArray(raw.person_locations)
    ? raw.person_locations.map(String)
    : [];
  const parts = [
    raw.country,
    raw.city,
    raw.state,
    raw.present_raw_address,
    raw.formatted_address,
    raw.person_location,
    raw.location,
    ...personLocations,
    org?.country,
    org?.raw_address,
    org?.city,
    org?.state,
    typeof raw.pais === "string" ? raw.pais : null,
  ];
  return normalizeLocationText(parts.filter(Boolean).map(String).join(" "));
}

function countryAliases(countryValue: string): string[] {
  return COUNTRY_LOCATION_ALIASES[countryValue] ?? [normalizeLocationText(countryValue).trim()];
}

function textIndicatesCountry(text: string, countryValue: string): boolean {
  return countryAliases(countryValue).some((alias) => textIncludesAlias(text, alias.trim()));
}

/**
 * Apollo ya filtra con person_locations. Solo descartamos si hay señal clara de OTRO país.
 * Sin datos de ubicación en el perfil → se acepta (confianza en Apollo).
 */
export function personMatchesCountry(
  raw: Record<string, unknown>,
  countryValue: string
): boolean {
  const text = collectPersonLocationText(raw);
  if (!text.trim()) return true;

  if (textIndicatesCountry(text, countryValue)) return true;

  for (const country of APOLLO_COUNTRIES) {
    if (country.value === countryValue) continue;
    if (textIndicatesCountry(text, country.value)) return false;
  }

  return true;
}

export function normalizeEmployeeRanges(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const v = item.trim();
    if (!v || !ALLOWED_EMPLOYEE_RANGE_VALUES.has(v) || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function inferEmployeeRangesFromText(text: string): string[] {
  const q = text.toLowerCase();
  if (
    q.includes("mediana") ||
    q.includes("medianas") ||
    q.includes("mid-market") ||
    q.includes("mid market")
  ) {
    return q.includes("pequeña") || q.includes("pequeñas") ? ["11,200"] : ["51,500"];
  }
  if (
    q.includes("pequeña") ||
    q.includes("pequeñas") ||
    q.includes("pyme") ||
    q.includes("startup")
  ) {
    return ["1,50"];
  }
  if (
    q.includes("grande") ||
    q.includes("grandes") ||
    q.includes("enterprise") ||
    q.includes("corporativ")
  ) {
    return ["501,5000"];
  }
  return [];
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
  const titles = normalizeJobTitles(rawTitles.map(String));
  if (!titles.length) {
    throw new Error("Selecciona o agrega al menos un cargo.");
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

  const employeeRanges = normalizeEmployeeRanges(
    body.organization_num_employees_ranges ?? body.employee_ranges ?? body.employeeRanges
  );

  return {
    person_locations: [country],
    person_titles: titles,
    person_seniorities: seniority ? [seniority] : [],
    q_keywords: keyword,
    organization_name: company,
    organization_num_employees_ranges: employeeRanges,
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
  employee_ranges?: string[];
  apollo_zero_results?: boolean;
  webhook_configured?: boolean;
  organization_name?: string;
  company_rejected?: number;
  country_rejected?: number;
  portfolio_skipped?: number;
  timed_out?: boolean;
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
    const sizeHint =
      meta.employee_ranges?.length
        ? " Quita el filtro de tamaño de empresa,"
        : "";
    return (
      "Apollo no tiene perfiles para esta combinación (país + cargos + industria" +
      (meta.organization_name ? " + empresa" : "") +
      ")." +
      sizeHint +
      " prueba «Todas las industrias», otro nombre de empresa o menos cargos."
    );
  }

  if ((meta.portfolio_skipped ?? 0) > 0 && scanned === 0) {
    return (
      `Los perfiles encontrados ya están en tu portafolio (${meta.portfolio_skipped} omitidos). ` +
      "No se gastaron créditos en duplicados. Amplía cargos o cambia filtros para contactos nuevos."
    );
  }

  if ((meta.country_rejected ?? 0) > 0 && scanned > 0 && (stats?.with_both ?? 0) === 0) {
    return (
      `Se encontraron perfiles con ubicación en otro país (${meta.country_rejected} descartados). ` +
      "Ajusta el país en los filtros o amplía los cargos."
    );
  }

  if (
    meta.organization_name &&
    (meta.company_rejected ?? 0) > 0 &&
    scanned > 0 &&
    (stats?.with_both ?? 0) === 0
  ) {
    return (
      `Apollo devolvió perfiles pero ninguno coincide con «${meta.organization_name}» ` +
      `(${meta.company_rejected} descartados por empresa). Verifica el nombre exacto en Apollo.`
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
