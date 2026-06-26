import {
  APOLLO_COUNTRIES,
  APOLLO_EMPLOYEE_RANGES,
  APOLLO_KEYWORDS,
  APOLLO_PER_PAGE_OPTIONS,
  APOLLO_PRESET_JOB_TITLES,
  APOLLO_SENIORITIES,
  DEFAULT_SEARCH,
  inferEmployeeRangesFromText,
  normalizeEmployeeRanges,
  normalizeJobTitles,
} from "./apollo-filters";

export type SmartSearchFilters = {
  country: string;
  titles: string[];
  keyword: string;
  seniority: string;
  company: string;
  employeeRanges: string[];
  perPage: number;
};

const MAX_SMART_TITLES = 6;

export type SmartSearchResult = {
  filters: SmartSearchFilters;
  summary: string;
  source: "mistral" | "rules";
  model?: string;
};

export type MistralHealth = {
  configured: boolean;
  ok: boolean;
  model: string;
  message: string;
};

const DEFAULT_MISTRAL_MODEL = "mistral-small-latest";

export class SmartSearchError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "SmartSearchError";
  }
}

const FILTER_CATALOG = {
  countries: APOLLO_COUNTRIES.map((c) => ({ label: c.label, value: c.value })),
  jobTitles: APOLLO_PRESET_JOB_TITLES.map((t) => ({ label: t.label, value: t.value })),
  industries: APOLLO_KEYWORDS.map((k) => ({ label: k.label, value: k.value })),
  seniorities: APOLLO_SENIORITIES.map((s) => ({ label: s.label, value: s.value })),
  employeeRanges: APOLLO_EMPLOYEE_RANGES.filter((r) => r.value).map((r) => ({
    label: r.label,
    value: r.value,
  })),
  perPageOptions: [...APOLLO_PER_PAGE_OPTIONS],
};

export function getMistralModel(): string {
  return process.env.MISTRAL_MODEL?.trim() || DEFAULT_MISTRAL_MODEL;
}

export function isMistralConfigured(): boolean {
  return Boolean(process.env.MISTRAL_API_KEY?.trim());
}

function pickCountry(raw: string | undefined): string {
  if (!raw?.trim()) return DEFAULT_SEARCH.country;
  const norm = raw.toLowerCase().trim();
  const byValue = APOLLO_COUNTRIES.find((c) => c.value.toLowerCase() === norm);
  if (byValue) return byValue.value;
  const byLabel = APOLLO_COUNTRIES.find(
    (c) => c.label.toLowerCase() === norm || c.label.toLowerCase().includes(norm)
  );
  return byLabel?.value ?? DEFAULT_SEARCH.country;
}

/** Si el usuario menciona un país en la consulta, tiene prioridad sobre la IA. */
function enforceCountryFromQuery(country: string, userQuery: string): string {
  const q = userQuery.toLowerCase();
  if (q.includes("colombian") || q.includes(" en colombia") || q.endsWith("colombia")) {
    return "Colombia";
  }
  for (const c of APOLLO_COUNTRIES) {
    const label = c.label.toLowerCase();
    const value = c.value.toLowerCase();
    if (q.includes(label) || q.includes(value)) {
      return c.value;
    }
  }
  return country;
}

function pickKeyword(raw: string | undefined): string {
  if (!raw?.trim()) return "";
  const norm = raw.toLowerCase().trim();
  const byValue = APOLLO_KEYWORDS.find((k) => k.value.toLowerCase() === norm);
  if (byValue) return byValue.value;
  const byLabel = APOLLO_KEYWORDS.find(
    (k) =>
      k.label.toLowerCase() === norm ||
      k.label.toLowerCase().includes(norm) ||
      norm.includes(k.label.toLowerCase())
  );
  return byLabel?.value ?? "";
}

/** Industria a partir del texto del usuario (flores, agro, etc.). */
function inferKeywordFromQuery(query: string): string {
  const q = query.toLowerCase();
  if (
    /flor|agro|agricol|horticult|ganader|agroindustr|cultivo|exportaci[oó]n de (flor|frut|caf[eé])/.test(
      q
    )
  ) {
    return "agriculture";
  }
  for (const k of APOLLO_KEYWORDS) {
    if (!k.value) continue;
    if (q.includes(k.label.toLowerCase()) || q.includes(k.value.toLowerCase())) {
      return k.value;
    }
  }
  return "";
}

function userMentionedCompanySize(query: string): boolean {
  const q = query.toLowerCase();
  return /mediana|medianas|pequeña|pequeñas|grande|grandes|enterprise|pyme|startup|empleados|tamaño|tamano|\b1-50\b|\b51-/.test(
    q
  );
}

function userMentionedSeniorityLevel(query: string): boolean {
  const q = query.toLowerCase();
  if (q.includes("decisiones") || q.includes("decisor") || q.includes("quien decide")) {
    return false;
  }
  return /c-suite|c suite|vicepresident|\bvp\b|\bdirector\b|\bgerente\b|manager|head of|\bejecutiv/.test(
    q
  );
}

function pickSeniority(raw: string | undefined): string {
  if (!raw?.trim()) return "";
  const norm = raw.toLowerCase().trim();
  const byValue = APOLLO_SENIORITIES.find((s) => s.value.toLowerCase() === norm);
  if (byValue) return byValue.value;
  const byLabel = APOLLO_SENIORITIES.find((s) => s.label.toLowerCase().includes(norm));
  return byLabel?.value ?? "";
}

function pickPerPage(raw: unknown, userQuery?: string): number {
  if (userQuery) {
    const fromQuery = inferPerPageFromQuery(userQuery);
    if (fromQuery !== null) return fromQuery;
    if (!userMentionedResultCount(userQuery)) return DEFAULT_SEARCH.perPage;
  }
  const n = Number(raw);
  if (APOLLO_PER_PAGE_OPTIONS.includes(n as (typeof APOLLO_PER_PAGE_OPTIONS)[number])) {
    return n;
  }
  return DEFAULT_SEARCH.perPage;
}

function userMentionedResultCount(query: string): boolean {
  return (
    /\b\d{1,2}\s*(resultados?|contactos?|leads?|perfiles?)\b/i.test(query) ||
    /\b(?:quiero|busca|trae|muéstrame|muestra|necesito|dame)\s+\d{1,2}\b/i.test(query)
  );
}

function inferPerPageFromQuery(query: string): number | null {
  const patterns = [
    /\b(\d{1,2})\s*(?:resultados?|contactos?|leads?|perfiles?)\b/i,
    /\b(?:quiero|busca|trae|muéstrame|muestra|necesito|dame)\s+(\d{1,2})\b/i,
  ];
  for (const re of patterns) {
    const m = query.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (APOLLO_PER_PAGE_OPTIONS.includes(n as (typeof APOLLO_PER_PAGE_OPTIONS)[number])) {
      return n;
    }
    if (n >= 1 && n <= 25) {
      return [...APOLLO_PER_PAGE_OPTIONS].sort(
        (a, b) => Math.abs(a - n) - Math.abs(b - n)
      )[0];
    }
  }
  return null;
}

function userMentionedCountry(query: string): boolean {
  const q = query.toLowerCase();
  if (q.includes("colombian") || q.includes(" en colombia") || q.endsWith("colombia")) {
    return true;
  }
  return APOLLO_COUNTRIES.some(
    (c) => q.includes(c.label.toLowerCase()) || q.includes(c.value.toLowerCase())
  );
}

function resolveCountry(parsedCountry: string, userQuery: string): string {
  if (userMentionedCountry(userQuery)) {
    return enforceCountryFromQuery(pickCountry(parsedCountry), userQuery);
  }
  return DEFAULT_SEARCH.country;
}

/** Mapea sugerencias de IA a cargos permitidos en Apollo. */
export function mapTitlesFromSuggestions(suggestions: string[]): string[] {
  const matched = new Set<string>();
  const tokens = suggestions.flatMap((s) => s.split(/[,;/|]+/).map((t) => t.trim())).filter(Boolean);
  const fullText = suggestions.join(" ").toLowerCase();

  if (/flor|agro|exportaci[oó]n/.test(fullText)) {
    matched.add("General Manager");
    matched.add("CEO");
    matched.add("Chief Operating Officer");
  }
  if (/\berp\b|software a medida|sistema de gesti/.test(fullText)) {
    matched.add("CIO");
    matched.add("IT Director");
    matched.add("Chief Financial Officer");
    matched.add("General Manager");
  }
  if (/decision|decisor|encargad/.test(fullText)) {
    matched.add("CEO");
    matched.add("General Manager");
    matched.add("Chief Operating Officer");
  }

  for (const token of tokens) {
    const norm = token.toLowerCase();

    if (norm.includes("tecnolog") || norm.includes("sistemas") || (norm.includes("director") && /\bti\b/.test(norm))) {
      matched.add("IT Director");
      continue;
    }
    if (norm.includes("automatiz") || norm.includes("rpa") || norm.includes("proceso")) {
      matched.add("Director of Automation");
      matched.add("Chief Operating Officer");
      continue;
    }
    if (
      norm.includes("inteligencia artificial") ||
      norm.includes(" entrenamiento") ||
      /\bia\b/.test(norm) ||
      norm.includes("machine learning") ||
      norm.includes(" aprendizaje")
    ) {
      matched.add("Director of Artificial Intelligence");
      matched.add("Director of Data Science");
      matched.add("CTO");
      continue;
    }
    if (
      norm.includes("predicci") ||
      norm.includes("demanda") ||
      norm.includes("forecast") ||
      norm.includes("planificaci") ||
      norm.includes("supply chain") ||
      norm.includes("cadena")
    ) {
      matched.add("Director of Demand Planning");
      matched.add("VP of Supply Chain");
      matched.add("Director of Analytics");
      continue;
    }
    if (norm.includes("datos") || norm.includes("data") || norm.includes("analytics") || norm.includes("bi")) {
      matched.add("Chief Data Officer");
      matched.add("Director of Data Science");
      matched.add("Director of Analytics");
      continue;
    }
    if (norm.includes("operac") || norm.includes("coo")) {
      matched.add("Chief Operating Officer");
      continue;
    }
    if (norm.includes("transformaci") && norm.includes("digital")) {
      matched.add("Director of Digital Transformation");
      matched.add("Chief Digital Officer");
      matched.add("Director of Innovation");
      matched.add("CTO");
      continue;
    }
    if (norm.includes("formaci") || norm.includes("capacit") || norm.includes("entrenamiento")) {
      matched.add("Director of Talent");
      matched.add("Human Resources Director");
      matched.add("Chief Human Resources Officer");
      matched.add("Director of Innovation");
      continue;
    }
    if (norm.includes("lider") || norm.includes("líder") || norm.includes("leader")) {
      matched.add("Director of Innovation");
      matched.add("IT Director");
      continue;
    }
    if (
      norm.includes("recursos humanos") ||
      norm.includes("rrhh") ||
      norm.includes("talento humano") ||
      norm.includes("people")
    ) {
      matched.add("Human Resources Director");
      matched.add("Chief Human Resources Officer");
      continue;
    }
    if (norm.includes("logist") || norm.includes("transporte") || norm.includes("almacen")) {
      matched.add("Director of Logistics");
      matched.add("Logistics Manager");
      continue;
    }
    if (norm.includes("compras") || norm.includes("procurement")) {
      matched.add("Director of Procurement");
      continue;
    }
    if (norm.includes("marketing")) matched.add("Marketing Director");
    if (norm.includes("ventas") || norm.includes("sales") || norm.includes("comercial")) {
      matched.add("Sales Director");
    }
    if (norm.includes("finanz") || norm.includes("cfo")) matched.add("Chief Financial Officer");
    if (norm.includes("erp") || norm.includes("sistema de gesti")) {
      matched.add("CIO");
      matched.add("IT Director");
      matched.add("Chief Financial Officer");
      matched.add("General Manager");
    }
    if (
      norm.includes("decision") ||
      norm.includes("decisor") ||
      norm.includes("encargad") ||
      norm.includes("responsable de")
    ) {
      matched.add("CEO");
      matched.add("General Manager");
      matched.add("Chief Operating Officer");
    }

    for (const t of APOLLO_PRESET_JOB_TITLES) {
      const val = t.value.toLowerCase();
      const lab = t.label.toLowerCase();
      if (norm === val || norm === lab || lab.includes(norm) || norm.includes(val)) {
        matched.add(t.value);
      }
    }
    if (/(^|\s)cto(\s|$)/.test(norm) || norm === "cto") matched.add("CTO");
    if (/(^|\s)cio(\s|$)/.test(norm) || norm === "cio") matched.add("CIO");
    if (norm.includes("cdo") || norm.includes("chief data")) matched.add("Chief Data Officer");
  }

  return [...matched];
}

/** Prioriza cargos más alineados con la consulta y limita cantidad para Apollo. */
export function rankAndLimitTitles(titles: string[], userQuery: string): string[] {
  const q = userQuery.toLowerCase();
  const unique = normalizeJobTitles(titles);
  const scoreTitle = (title: string): number => {
    const t = title.toLowerCase();
    let score = 0;
    if (q.includes("ia") || q.includes("inteligencia artificial")) {
      if (t.includes("artificial intelligence") || t.includes("data science") || t === "cto") score += 5;
    }
    if (q.includes("automatiz") && t.includes("automation")) score += 5;
    if (q.includes("transformaci") && t.includes("digital")) score += 6;
    if (q.includes("formaci") || q.includes("talento") || q.includes("rrhh")) {
      if (t.includes("human resources") || t.includes("talent")) score += 5;
    }
    if (q.includes("demanda") || q.includes("inventario")) {
      if (t.includes("demand") || t.includes("supply")) score += 5;
    }
    if (q.includes("director") && t.includes("director")) score += 2;
    if (q.includes("tecnolog") && (t.includes("technology") || t.includes("it "))) score += 3;
    if (q.includes("erp") || q.includes("sistema")) {
      if (t.includes("cio") || t.includes("it director") || t.includes("chief financial")) score += 5;
      if (t.includes("general manager") || t === "ceo") score += 4;
    }
    if (q.includes("decision") || q.includes("decisor")) {
      if (t === "ceo" || t.includes("general manager") || t.includes("operating officer")) score += 5;
    }
    if (q.includes("flor") || q.includes("agro") || q.includes("exportaci")) {
      if (t.includes("general manager") || t === "ceo" || t.includes("operating officer")) score += 3;
    }
    return score;
  };

  return [...unique]
    .sort((a, b) => scoreTitle(b) - scoreTitle(a))
    .slice(0, MAX_SMART_TITLES);
}

/** Combina mapeo por reglas con cargos libres válidos para Apollo. */
export function coerceJobTitles(suggestions: string[], fallbackQuery?: string): string[] {
  const mapped = mapTitlesFromSuggestions(suggestions);
  const merged = normalizeJobTitles([...mapped, ...suggestions]);
  const base = merged.length ? merged : [];

  const fromQuery = fallbackQuery
    ? normalizeJobTitles([...mapTitlesFromSuggestions([fallbackQuery]), fallbackQuery])
    : [];

  const combined = base.length ? base : fromQuery;
  if (!combined.length) return [];
  return fallbackQuery ? rankAndLimitTitles(combined, fallbackQuery) : combined.slice(0, MAX_SMART_TITLES);
}

function sanitizeCompany(raw: string | undefined): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function parseMistralJsonContent(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new SmartSearchError("Mistral no devolvió JSON válido.");
    return JSON.parse(match[0]) as Record<string, unknown>;
  }
}

function inferSeniorityFromQuery(query: string): string {
  const q = query.toLowerCase();
  if (q.includes("decisiones") || q.includes("decisor")) return "";
  if (q.includes("c-suite") || q.includes("c suite") || q.includes("ejecutiv")) return "c_suite";
  if (q.includes("vp ") || q.includes("vicepresident")) return "vp";
  if (q.includes("director") || q.includes("líder") || q.includes("lider")) return "director";
  if (q.includes("gerente") || q.includes("manager")) return "manager";
  if (q.includes("head ")) return "head";
  return "";
}

function pickEmployeeRanges(raw: unknown, userQuery: string): string[] {
  if (!userMentionedCompanySize(userQuery)) return [];
  const fromAi = normalizeEmployeeRanges(raw);
  if (fromAi.length) return fromAi;
  return inferEmployeeRangesFromText(userQuery);
}

/** Normaliza filtros interpretados: solo lo inferido de la consulta, sin arrastrar valores previos. */
export function finalizeSmartFilters(
  filters: SmartSearchFilters,
  userQuery: string
): SmartSearchFilters {
  const titles = rankAndLimitTitles(coerceJobTitles(filters.titles, userQuery), userQuery);
  if (!titles.length) {
    throw new SmartSearchError(
      "No identifiqué cargos en tu consulta. Indica el rol objetivo (ej. CEO, director de TI, gerente general)."
    );
  }

  return {
    country: resolveCountry(filters.country, userQuery),
    titles,
    keyword: pickKeyword(filters.keyword) || inferKeywordFromQuery(userQuery),
    seniority: userMentionedSeniorityLevel(userQuery)
      ? pickSeniority(filters.seniority) || inferSeniorityFromQuery(userQuery)
      : "",
    company: sanitizeCompany(filters.company),
    employeeRanges: pickEmployeeRanges(filters.employeeRanges, userQuery),
    perPage: pickPerPage(filters.perPage, userQuery),
  };
}

function buildFiltersFromParsed(
  parsed: Record<string, unknown>,
  userQuery: string,
  model: string
): SmartSearchResult {
  const rawTitles = Array.isArray(parsed.titles)
    ? parsed.titles.map(String)
    : parsed.titles
      ? [String(parsed.titles)]
      : [];
  const titles = coerceJobTitles(rawTitles, userQuery);

  const seniorityFromAi = pickSeniority(String(parsed.seniority ?? ""));
  const inferredSeniority = inferSeniorityFromQuery(userQuery);
  const seniority = userMentionedSeniorityLevel(userQuery)
    ? seniorityFromAi || inferredSeniority
    : "";
  const employeeRanges = pickEmployeeRanges(
    parsed.employee_ranges ?? parsed.employeeRanges,
    userQuery
  );

  const filters = finalizeSmartFilters(
    {
      country: pickCountry(String(parsed.country ?? "")),
      titles,
      keyword: pickKeyword(String(parsed.keyword ?? "")) || inferKeywordFromQuery(userQuery),
      seniority,
      company: sanitizeCompany(String(parsed.company ?? "")),
      employeeRanges,
      perPage: pickPerPage(parsed.per_page, userQuery),
    },
    userQuery
  );

  const aiSummary = String(parsed.summary ?? "").trim();
  const sizeLabel = filters.employeeRanges.length
    ? APOLLO_EMPLOYEE_RANGES.find((r) => r.value === filters.employeeRanges[0])?.label ??
      filters.employeeRanges[0]
    : null;
  const summary = aiSummary
    ? `Mistral IA: ${aiSummary}${sizeLabel ? ` · Tamaño: ${sizeLabel}` : ""} · ${filters.perPage} resultados`
    : `Mistral IA · ${filters.country} · ${filters.titles.join(", ")}${filters.company ? ` · ${filters.company}` : ""}${sizeLabel ? ` · ${sizeLabel}` : ""} · ${filters.perPage} resultados`;

  return { filters, summary, source: "mistral", model };
}

export function buildSmartSearchPrompt(userQuery: string): string {
  return `Eres el asistente de prospección B2B de IAC SAS (Colombia/LATAM). El usuario describe su persona objetivo en español.
Analiza la intención y devuelve SOLO un JSON válido (sin markdown) con esta forma exacta:
{
  "country": "valor exacto de país de la lista",
  "titles": ["máximo 6 cargos más relevantes: valor exacto de jobTitles o título libre en inglés"],
  "keyword": "valor exacto de industria o cadena vacía",
  "seniority": "valor exacto de seniority o cadena vacía",
  "company": "nombre de empresa si la menciona, o cadena vacía",
  "employee_ranges": ["uno o más rangos value de employeeRanges, o array vacío"],
  "per_page": número entre 5 y 25 (usa 5 salvo que el usuario pida otra cantidad explícita),
  "summary": "frase breve en español explicando qué buscará Apollo"
}

Reglas estrictas:
- country, keyword, seniority y employee_ranges[].value deben ser valores "value" EXACTOS de las listas (copia literal).
- Si el usuario pide un país específico (ej. Colombia), country DEBE ser ese país. Nunca otro.
- employee_ranges: SOLO si el usuario menciona explícitamente tamaño (pequeña, mediana, grande, pyme, empleados). Si no lo menciona → [].
- Si menciona "empresas medianas" → employee_ranges: ["51,500"]. Pequeñas → ["1,50"]. Grandes → ["501,5000"].
- seniority: SOLO si pide nivel explícito (director, gerente, C-suite, VP). "Quien toma decisiones" NO implica seniority.
- Floricultura, agro, exportación agrícola → keyword: "agriculture".
- titles: máximo 6 cargos alineados con la consulta (no listes todos los posibles).
- ERP o software a medida → CIO, IT Director, CFO, General Manager o CEO según contexto.
- Si habla de transformación digital, IA o automatización → cargos coherentes (CTO, Director of Innovation, etc.).
- Si no menciona país → "Colombia".
- per_page: 5 por defecto. Solo otro valor si el usuario pide cantidad (ej. "10 contactos", "quiero 15 resultados").
- No inventes filtros: campos vacíos si el usuario no los mencionó (keyword "", seniority "", employee_ranges [], company "").

Listas permitidas:
${JSON.stringify(FILTER_CATALOG, null, 2)}

Consulta del usuario:
${userQuery}`;
}

async function callMistralChat(userContent: string, maxTokens = 600): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  if (!apiKey) {
    throw new SmartSearchError("MISTRAL_API_KEY no configurada en el servidor.");
  }

  const model = getMistralModel();
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.05,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Eres un parser de intención B2B. Respondes únicamente JSON válido. Nunca inventes valores fuera de las listas del usuario.",
        },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) {
      throw new SmartSearchError(
        "API key de Mistral inválida. Verifica MISTRAL_API_KEY en Vercel.",
        401
      );
    }
    if (res.status === 429) {
      throw new SmartSearchError("Límite de Mistral alcanzado. Intenta en unos segundos.", 429);
    }
    throw new SmartSearchError(
      `Mistral respondió ${res.status}: ${text.slice(0, 200)}`,
      res.status
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new SmartSearchError("Mistral no devolvió contenido en la respuesta.");
  }
  return content;
}

/** Verifica conectividad con Mistral (sin exponer la API key). */
export async function verifyMistralHealth(): Promise<MistralHealth> {
  const model = getMistralModel();
  if (!isMistralConfigured()) {
    return {
      configured: false,
      ok: false,
      model,
      message: "MISTRAL_API_KEY no configurada.",
    };
  }

  const apiKey = process.env.MISTRAL_API_KEY!.trim();
  try {
    const res = await fetch("https://api.mistral.ai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 0 },
    });

    if (res.status === 401) {
      return {
        configured: true,
        ok: false,
        model,
        message: "API key de Mistral inválida. Revisa MISTRAL_API_KEY en Vercel.",
      };
    }

    if (!res.ok) {
      return {
        configured: true,
        ok: false,
        model,
        message: `Mistral respondió ${res.status}.`,
      };
    }

    return {
      configured: true,
      ok: true,
      model,
      message: "Conexión con Mistral operativa.",
    };
  } catch {
    return {
      configured: true,
      ok: false,
      model,
      message: "No se pudo conectar con la API de Mistral.",
    };
  }
}

async function interpretWithMistral(userQuery: string): Promise<SmartSearchResult> {
  const model = getMistralModel();
  const content = await callMistralChat(buildSmartSearchPrompt(userQuery));
  const parsed = parseMistralJsonContent(content);
  return buildFiltersFromParsed(parsed, userQuery, model);
}

function ruleBasedInterpret(userQuery: string): SmartSearchResult {
  const q = userQuery.toLowerCase();
  let country = DEFAULT_SEARCH.country;
  let keyword = "";
  let seniority = "";
  let company = "";
  const titleHints: string[] = [];

  for (const c of APOLLO_COUNTRIES) {
    if (q.includes(c.label.toLowerCase()) || q.includes(c.value.toLowerCase())) {
      country = c.value;
      break;
    }
  }

  for (const k of APOLLO_KEYWORDS) {
    if (!k.value) continue;
    if (q.includes(k.label.toLowerCase()) || q.includes(k.value.toLowerCase())) {
      keyword = k.value;
      break;
    }
  }

  for (const s of APOLLO_SENIORITIES) {
    if (!s.value) continue;
    if (q.includes(s.label.toLowerCase()) || q.includes(s.value.replace("_", " "))) {
      seniority = s.value;
      break;
    }
  }

  if (q.includes("c-suite") || q.includes("c suite")) seniority = "c_suite";
  if (q.includes("director")) titleHints.push("director");
  if (/(^|\s)cto(\s|$)/.test(q)) titleHints.push("CTO");
  if (/(^|\s)cio(\s|$)/.test(q)) titleHints.push("CIO");
  if (/(^|\s)ceo(\s|$)/.test(q)) titleHints.push("CEO");
  if (q.includes("tecnolog") || q.includes("sistemas") || /\bti\b/.test(q)) {
    titleHints.push("IT Director", "Director of Technology", "IT Manager");
  }
  if (q.includes("gerente")) titleHints.push("General Manager", "IT Manager");
  if (q.includes("vp")) titleHints.push("VP of Engineering");

  const companyMatch =
    userQuery.match(/(?:empresa|compañ[ií]a|organizaci[oó]n)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ0-9.&\-\s]{2,80})/i) ??
    userQuery.match(/(?:en|de la empresa)\s+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúñÑ0-9.&\-\s]{2,60})/);
  if (companyMatch?.[1]) {
    company = sanitizeCompany(companyMatch[1].replace(/\s+(con|que|en|de|para).*$/i, ""));
  }

  const titles = coerceJobTitles(titleHints.length ? titleHints : [userQuery], userQuery);
  const employeeRanges = userMentionedCompanySize(userQuery)
    ? inferEmployeeRangesFromText(userQuery)
    : [];
  const resolvedSeniority = userMentionedSeniorityLevel(userQuery)
    ? inferSeniorityFromQuery(userQuery) || seniority
    : "";

  const parts = [
    country,
    titles.join(", "),
    inferKeywordFromQuery(userQuery) || keyword || "todas las industrias",
    company ? `empresa ${company}` : null,
    resolvedSeniority || null,
    employeeRanges.length ? `tamaño ${employeeRanges.join(",")}` : null,
    `${pickPerPage(undefined, userQuery)} resultados`,
  ].filter(Boolean);

  const filters = finalizeSmartFilters(
    {
      country,
      titles,
      keyword: inferKeywordFromQuery(userQuery) || keyword,
      seniority: resolvedSeniority,
      company,
      employeeRanges,
      perPage: pickPerPage(undefined, userQuery),
    },
    userQuery
  );

  return {
    filters,
    summary: `Modo básico (sin IA): ${parts.join(" · ")}.`,
    source: "rules",
  };
}

export async function interpretSmartSearch(userQuery: string): Promise<SmartSearchResult> {
  const trimmed = userQuery.trim();
  if (trimmed.length < 4) {
    throw new SmartSearchError("Describe tu persona objetivo con al menos 4 caracteres.");
  }
  if (trimmed.length > 800) {
    throw new SmartSearchError("La consulta es demasiado larga (máx. 800 caracteres).");
  }

  if (isMistralConfigured()) {
    return interpretWithMistral(trimmed);
  }

  return ruleBasedInterpret(trimmed);
}

export function normalizeSmartFilters(
  raw: Partial<SmartSearchFilters>,
  userQuery?: string
): SmartSearchFilters {
  const titles = normalizeJobTitles([
    ...mapTitlesFromSuggestions(raw.titles ?? []),
    ...(raw.titles ?? []),
  ]);
  const base: SmartSearchFilters = {
    country: pickCountry(raw.country),
    titles,
    keyword: pickKeyword(raw.keyword),
    seniority: pickSeniority(raw.seniority),
    company: sanitizeCompany(raw.company),
    employeeRanges: normalizeEmployeeRanges(raw.employeeRanges),
    perPage: pickPerPage(raw.perPage, userQuery),
  };
  return userQuery ? finalizeSmartFilters(base, userQuery) : base;
}
