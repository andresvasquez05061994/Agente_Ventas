import { searchApolloOrganizations } from "./apollo-organizations";
import {
  formatMatchExplanation,
  formatSolutionNames,
  rankSolutionsForProspect,
  type IACSolution,
} from "./iac-portfolio-knowledge";

export type ProspectInput = {
  nombre: string;
  cargo?: string | null;
  empresa?: string | null;
  pais?: string | null;
  email?: string | null;
  notas?: string | null;
  fuente?: string | null;
  linkedin_url?: string | null;
};

export type ProspectContext = {
  recommended_solutions: IACSolution[];
  solution_match_explanation: string;
  company_domain: string | null;
  company_web_title: string | null;
  company_web_summary: string | null;
  intel_sources: string[];
};

const FETCH_TIMEOUT_MS = 9000;
const MAX_HTML_BYTES = 350_000;
const MAX_TEXT_CHARS = 2200;

function normalizeDomain(raw: string): string | null {
  const trimmed = raw.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (!trimmed || !trimmed.includes(".")) return null;
  return `https://${trimmed}`;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMeta(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const match = html.match(re);
  return match?.[1]?.trim() || null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() || null;
}

async function fetchWebsiteIntel(
  url: string
): Promise<{ title: string | null; description: string | null; excerpt: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; IACVentasBot/1.0; +https://www.iaclatam.com.co)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return null;
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_HTML_BYTES) return null;

    const html = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    const title = extractTitle(html);
    const description =
      extractMeta(html, "description") ??
      extractMeta(html, "og:description") ??
      extractMeta(html, "twitter:description");

    const excerpt = htmlToText(html).slice(0, MAX_TEXT_CHARS);
    if (!title && !description && excerpt.length < 80) return null;

    return { title, description, excerpt };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveCompanyDomain(
  empresa: string,
  pais?: string | null
): Promise<string | null> {
  const term = empresa.trim();
  if (term.length < 2) return null;

  try {
    const orgs = await searchApolloOrganizations(term, pais ?? undefined);
    const termLower = term.toLowerCase();

    const best =
      orgs.find((o) => o.name.toLowerCase() === termLower) ??
      orgs.find(
        (o) =>
          o.name.toLowerCase().includes(termLower) || termLower.includes(o.name.toLowerCase())
      ) ??
      orgs[0];

    if (!best?.domain) return null;
    return normalizeDomain(String(best.domain));
  } catch {
    return null;
  }
}

function guessDomainFromEmail(email: string | null | undefined): string | null {
  if (!email?.includes("@")) return null;
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!domain) return null;
  const free = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com"];
  if (free.includes(domain)) return null;
  return normalizeDomain(domain);
}

export async function gatherProspectContext(input: ProspectInput): Promise<ProspectContext> {
  const intel_sources: string[] = ["portafolio IAC"];
  let company_domain: string | null = null;
  let company_web_title: string | null = null;
  let company_web_summary: string | null = null;
  let hints = [input.cargo, input.empresa, input.notas, input.fuente, input.pais]
    .filter(Boolean)
    .join(" ");

  if (input.empresa?.trim()) {
    company_domain = await resolveCompanyDomain(input.empresa, input.pais);
    if (company_domain) intel_sources.push("dominio vía Apollo");
  }

  if (!company_domain) {
    const fromEmail = guessDomainFromEmail(input.email);
    if (fromEmail) {
      company_domain = fromEmail;
      intel_sources.push("dominio del email corporativo");
    }
  }

  if (company_domain) {
    const web = await fetchWebsiteIntel(company_domain);
    if (web) {
      intel_sources.push("sitio web de la empresa");
      company_web_title = web.title;
      const parts = [web.description, web.excerpt].filter(Boolean);
      company_web_summary = parts.join(" — ").slice(0, MAX_TEXT_CHARS);
      hints = `${hints} ${company_web_summary}`;
    }
  }

  if (input.linkedin_url?.trim()) {
    intel_sources.push("perfil LinkedIn (referencia)");
    hints = `${hints} linkedin`;
  }

  const ranked = rankSolutionsForProspect(input.cargo, hints);
  const matched = ranked.filter((m) => m.score > 0).slice(0, 2).map((m) => m.solution);
  const recommended_solutions = matched.length ? matched : ranked[0] ? [ranked[0].solution] : [];
  const solution_match_explanation = formatMatchExplanation(ranked);

  return {
    recommended_solutions,
    solution_match_explanation,
    company_domain,
    company_web_title,
    company_web_summary,
    intel_sources,
  };
}

export function formatProspectContextBlock(
  input: ProspectInput,
  context: ProspectContext
): string {
  const lines = [
    `### Datos del contacto`,
    `- Nombre: ${input.nombre}`,
    `- Cargo: ${input.cargo || "No especificado"}`,
    `- Empresa: ${input.empresa || "No especificada"}`,
    `- País: ${input.pais || "Colombia/LATAM"}`,
  ];
  if (input.email) lines.push(`- Email: ${input.email}`);
  if (input.notas) lines.push(`- Notas del vendedor: ${input.notas}`);
  if (input.fuente) lines.push(`- Contexto de prospección: ${input.fuente}`);
  if (input.linkedin_url) lines.push(`- LinkedIn: ${input.linkedin_url}`);

  lines.push("", "### Inteligencia de la empresa prospecto");
  if (context.company_domain) lines.push(`- Sitio web: ${context.company_domain}`);
  if (context.company_web_title) lines.push(`- Título web: ${context.company_web_title}`);
  if (context.company_web_summary) {
    lines.push(`- Resumen del sitio (público): ${context.company_web_summary}`);
  } else {
    lines.push("- Sin datos públicos del sitio web; personaliza con cargo, sector y país.");
  }
  lines.push(`- Fuentes usadas: ${context.intel_sources.join(", ")}`);
  lines.push(`- Coincidencia portafolio IAC: ${context.solution_match_explanation}`);
  lines.push(
    `- Solución principal para el mensaje: ${formatSolutionNames(context.recommended_solutions)[0] ?? "Centro de Automatización"}`
  );
  if (context.recommended_solutions[1]) {
    lines.push(
      `- Solución complementaria (opcional): ${formatSolutionNames(context.recommended_solutions)[1]}`
    );
  }

  return lines.join("\n");
}
