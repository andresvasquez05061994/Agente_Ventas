import {
  APOLLO_COUNTRIES,
  APOLLO_KEYWORDS,
  APOLLO_PER_PAGE_OPTIONS,
  APOLLO_PRESET_JOB_TITLES,
  APOLLO_SENIORITIES,
  DEFAULT_SEARCH,
  normalizeJobTitles,
} from "./apollo-filters";

export type SmartSearchFilters = {
  country: string;
  titles: string[];
  keyword: string;
  seniority: string;
  company: string;
  perPage: number;
};

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

function pickSeniority(raw: string | undefined): string {
  if (!raw?.trim()) return "";
  const norm = raw.toLowerCase().trim();
  const byValue = APOLLO_SENIORITIES.find((s) => s.value.toLowerCase() === norm);
  if (byValue) return byValue.value;
  const byLabel = APOLLO_SENIORITIES.find((s) => s.label.toLowerCase().includes(norm));
  return byLabel?.value ?? "";
}

function pickPerPage(raw: unknown): number {
  const n = Number(raw);
  if (APOLLO_PER_PAGE_OPTIONS.includes(n as (typeof APOLLO_PER_PAGE_OPTIONS)[number])) {
    return n;
  }
  return DEFAULT_SEARCH.perPage;
}

/** Mapea sugerencias de IA a cargos permitidos en Apollo. */
export function mapTitlesFromSuggestions(suggestions: string[]): string[] {
  const matched = new Set<string>();
  const tokens = suggestions.flatMap((s) => s.split(/[,;/|]+/).map((t) => t.trim())).filter(Boolean);

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
    if (norm.includes("innovaci")) {
      matched.add("Director of Innovation");
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

/** Combina mapeo por reglas con cargos libres válidos para Apollo. */
export function coerceJobTitles(suggestions: string[], fallbackQuery?: string): string[] {
  const mapped = mapTitlesFromSuggestions(suggestions);
  const merged = normalizeJobTitles([...mapped, ...suggestions]);
  if (merged.length) return merged;

  const fromQuery = fallbackQuery
    ? normalizeJobTitles([...mapTitlesFromSuggestions([fallbackQuery]), fallbackQuery])
    : [];
  if (fromQuery.length) return fromQuery;

  return [...DEFAULT_SEARCH.titles];
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

  const filters: SmartSearchFilters = {
    country: pickCountry(String(parsed.country ?? "")),
    titles,
    keyword: pickKeyword(String(parsed.keyword ?? "")),
    seniority: pickSeniority(String(parsed.seniority ?? "")),
    company: sanitizeCompany(String(parsed.company ?? "")),
    perPage: pickPerPage(parsed.per_page),
  };

  const aiSummary = String(parsed.summary ?? "").trim();
  const summary = aiSummary
    ? `Mistral IA: ${aiSummary}`
    : `Mistral IA · ${filters.country} · ${filters.titles.join(", ")}${filters.company ? ` · ${filters.company}` : ""}`;

  return { filters, summary, source: "mistral", model };
}

export function buildSmartSearchPrompt(userQuery: string): string {
  return `Eres el asistente de prospección B2B de IAC SAS (Colombia/LATAM). El usuario describe su persona objetivo en español.
Analiza la intención y devuelve SOLO un JSON válido (sin markdown) con esta forma exacta:
{
  "country": "valor exacto de país de la lista",
  "titles": ["uno o más cargos: valor exacto de jobTitles o título libre válido en inglés"],
  "keyword": "valor exacto de industria o cadena vacía",
  "seniority": "valor exacto de seniority o cadena vacía",
  "company": "nombre de empresa si la menciona, o cadena vacía",
  "per_page": número entre 5 y 25,
  "summary": "frase breve en español explicando qué buscará Apollo"
}

Reglas estrictas:
- country, keyword y seniority deben ser valores "value" EXACTOS de las listas (copia literal).
- titles: usa valores de jobTitles cuando aplique; si no hay coincidencia, un título libre en inglés válido para Apollo (ej. "Warehouse Manager").
- Si no menciona país → "Colombia".
- Si no menciona industria → "".
- Si no menciona seniority → "".
- titles: mínimo 1 cargo; infiere el más cercano si el usuario habla en lenguaje natural.
- Si menciona empresa (ej. Bancolombia, Éxito, Sura) → company con ese nombre.
- per_page por defecto 10.

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

  const parts = [
    country,
    titles.join(", "),
    keyword || "todas las industrias",
    company ? `empresa ${company}` : null,
    seniority || null,
  ].filter(Boolean);

  return {
    filters: {
      country,
      titles,
      keyword,
      seniority,
      company,
      perPage: DEFAULT_SEARCH.perPage,
    },
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

export function normalizeSmartFilters(raw: Partial<SmartSearchFilters>): SmartSearchFilters {
  const titles = normalizeJobTitles([
    ...mapTitlesFromSuggestions(raw.titles ?? []),
    ...(raw.titles ?? []),
  ]);
  return {
    country: pickCountry(raw.country),
    titles: titles.length ? titles : [...DEFAULT_SEARCH.titles],
    keyword: pickKeyword(raw.keyword),
    seniority: pickSeniority(raw.seniority),
    company: sanitizeCompany(raw.company),
    perPage: pickPerPage(raw.perPage),
  };
}
