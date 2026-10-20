import { searchApolloOrganizations } from "./apollo-organizations";
import {
  formatMatchExplanation,
  formatSolutionNames,
  IAC_COMPANY_PROFILE,
  rankSolutionsForProspect,
  type IACSolution,
} from "./iac-portfolio-knowledge";
import type { BuyerPersona } from "./knowledge-store";
import {
  loadLiveKnowledge,
  matchBuyerPersona,
  pickRelevantExcerpts,
  rankCatalogForProspect,
  solutionsForKnowledge,
} from "./knowledge-match";
import { getMessagesForLead, listGeneratedMessages } from "./db";
import { etapaOf, MESSAGE_CHANNEL_LABELS, type GeneratedMessageSummary, type WhatsAppMessage } from "./types";

export type ProspectInput = {
  nombre: string;
  cargo?: string | null;
  empresa?: string | null;
  pais?: string | null;
  email?: string | null;
  notas?: string | null;
  fuente?: string | null;
  linkedin_url?: string | null;
  /** Si viene del portafolio: permite cargar historial y etapa reales desde la base. */
  lead_id?: number | null;
  lead_status?: string | null;
  resultado_gestion?: string | null;
  etapa_comercial?: string | null;
  created_at?: string | null;
};

/** Cómo debe plantearse el mensaje según etapa, resultado e historial. */
export type OutreachApproach =
  | "primer contacto"
  | "seguimiento"
  | "siguiente paso"
  | "reactivación"
  | "oportunidad"
  | "cliente";

export type ProspectHistory = {
  approach: OutreachApproach;
  approach_reason: string;
  /** Resumen en una línea: estado · resultado · etapa · mensajes previos. */
  stage_summary: string;
  generated: GeneratedMessageSummary[];
  whatsapp: WhatsAppMessage[];
};

export type ProspectContext = {
  recommended_solutions: IACSolution[];
  solution_match_explanation: string;
  company_domain: string | null;
  company_web_title: string | null;
  company_web_summary: string | null;
  intel_sources: string[];
  company_profile: typeof IAC_COMPANY_PROFILE;
  knowledge_excerpt: string;
  knowledge_from_documents: boolean;
  buyer_persona: BuyerPersona | null;
  history: ProspectHistory;
};

const MAX_HISTORY_GENERATED = 5;
const MAX_HISTORY_WHATSAPP = 6;

/** Decide el enfoque del mensaje. Determinista: se prueba sin IA ni base de datos. */
export function determineApproach(
  input: Pick<ProspectInput, "resultado_gestion" | "etapa_comercial">,
  generated: Pick<GeneratedMessageSummary, "channel">[],
  whatsapp: Pick<WhatsAppMessage, "direction">[]
): { approach: OutreachApproach; reason: string } {
  const etapa = etapaOf(input.etapa_comercial);
  const resultado = input.resultado_gestion ?? null;
  const previous = generated.length;
  const outbound = whatsapp.filter((m) => m.direction === "outbound").length;
  const inbound = whatsapp.filter((m) => m.direction === "inbound").length;

  if (etapa === "Cliente") {
    return { approach: "cliente", reason: "La empresa ya es cliente: relación y ampliación, no venta en frío." };
  }
  if (etapa === "Oportunidad") {
    return { approach: "oportunidad", reason: "Hay una oportunidad abierta: el mensaje debe avanzar el siguiente paso concreto." };
  }
  if (resultado === "No contesta") {
    return { approach: "reactivación", reason: "Marcado como No contesta: mensaje breve con un ángulo nuevo." };
  }
  if (resultado === "Interesado") {
    return { approach: "siguiente paso", reason: "Mostró interés: concreta agenda o siguiente acción." };
  }
  if (resultado === "En seguimiento" || previous > 0 || outbound > 0 || inbound > 0) {
    const bits = [
      previous ? `${previous} mensaje(s) IA previos` : null,
      outbound || inbound ? `${outbound + inbound} mensaje(s) de WhatsApp` : null,
    ].filter(Boolean);
    return {
      approach: "seguimiento",
      reason: bits.length ? `Ya hubo contacto: ${bits.join(", ")}.` : "Está en seguimiento.",
    };
  }
  return { approach: "primer contacto", reason: "Sin gestión previa registrada." };
}

export function buildStageSummary(
  input: Pick<ProspectInput, "lead_status" | "resultado_gestion" | "etapa_comercial">,
  generatedCount: number
): string {
  return [
    input.lead_status || "Nuevo",
    input.resultado_gestion || "sin resultado",
    `etapa ${etapaOf(input.etapa_comercial)}`,
    generatedCount ? `${generatedCount} mensaje(s) IA previos` : "sin mensajes previos",
  ].join(" · ");
}

async function loadHistory(input: ProspectInput, ownerId: number): Promise<ProspectHistory> {
  let generated: GeneratedMessageSummary[] = [];
  let whatsapp: WhatsAppMessage[] = [];
  const leadId = Number(input.lead_id);
  if (Number.isFinite(leadId) && leadId > 0) {
    try {
      [generated, whatsapp] = await Promise.all([
        listGeneratedMessages(leadId, ownerId, MAX_HISTORY_GENERATED),
        getMessagesForLead(leadId).then((rows) => rows.slice(-MAX_HISTORY_WHATSAPP)),
      ]);
    } catch {
      /* sin historial: el mensaje se genera igual como primer contacto */
    }
  }
  const { approach, reason } = determineApproach(input, generated, whatsapp);
  return {
    approach,
    approach_reason: reason,
    stage_summary: buildStageSummary(input, generated.length),
    generated,
    whatsapp,
  };
}

function shortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

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

export async function gatherProspectContext(
  input: ProspectInput,
  ownerId: number
): Promise<ProspectContext> {
  const [live, history] = await Promise.all([loadLiveKnowledge(ownerId), loadHistory(input, ownerId)]);
  const intel_sources: string[] = live.fromDocuments
    ? ["documentos del proyecto"]
    : ["catálogo IAC (referencia interna)"];
  if (history.generated.length || history.whatsapp.length) intel_sources.push("historial del contacto");
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

  let query = `${hints} ${company_web_summary ?? ""}`;
  const buyer_persona = matchBuyerPersona(live.personas, input.cargo, query);
  if (buyer_persona) {
    intel_sources.push(`buyer persona: ${buyer_persona.name}`);
    query = `${query} ${buyer_persona.role} ${buyer_persona.sector} ${buyer_persona.characteristics} ${buyer_persona.value_for_client}`;
  }
  const catalog = solutionsForKnowledge(live);
  const ranked = live.fromDocuments
    ? rankCatalogForProspect(catalog, input.cargo, query)
    : rankSolutionsForProspect(input.cargo, query);
  const matched = ranked.filter((m) => m.score > 0).slice(0, 2).map((m) => m.solution);
  const recommended_solutions = matched.length ? matched : ranked[0] ? [ranked[0].solution] : [];
  const solution_match_explanation = formatMatchExplanation(ranked);

  let knowledge_excerpt = "";
  if (live.fromDocuments) {
    const picked = pickRelevantExcerpts(live.documents, query);
    knowledge_excerpt = picked.excerpt;
    if (picked.sources.length) intel_sources.push(...picked.sources.map((name) => `doc: ${name}`));
  }
  if (live.profile.notes.trim()) {
    knowledge_excerpt = knowledge_excerpt
      ? `${knowledge_excerpt}\n\n[Notas del perfil]\n${live.profile.notes}`
      : `[Notas del perfil]\n${live.profile.notes}`;
  }

  return {
    recommended_solutions,
    solution_match_explanation,
    company_domain,
    company_web_title,
    company_web_summary,
    intel_sources,
    company_profile: {
      name: live.company.name,
      tagline: live.company.tagline,
      experience: live.company.experience,
      scale: live.company.scale,
      sectors: live.company.sectors,
      domains: IAC_COMPANY_PROFILE.domains,
      contact: live.company.contact,
    },
    knowledge_excerpt,
    knowledge_from_documents: live.fromDocuments,
    buyer_persona,
    history,
  };
}

/** Reglas de tono según el enfoque. Van al prompt y las usa el modo básico. */
export function approachRules(history: ProspectHistory): string {
  const base = `- Enfoque obligatorio: ${history.approach.toUpperCase()} (${history.approach_reason})`;
  switch (history.approach) {
    case "seguimiento":
      return `${base}
- No te presentes como si fuera la primera vez. Menciona que ya hubo un contacto previo (canal y fecha del historial) sin inventar lo que respondió el prospecto.
- Aporta algo nuevo (dato, ejemplo, pregunta) en lugar de repetir el mensaje anterior.`;
    case "siguiente paso":
      return `${base}
- El prospecto ya mostró interés: agradece, resume el valor acordado en una frase y propón fecha/hora concreta o el entregable siguiente.`;
    case "reactivación":
      return `${base}
- Máxima brevedad. Un ángulo distinto al de los mensajes previos. Sin reproches por no responder y con salida fácil («si no es prioridad, lo entiendo»).`;
    case "oportunidad":
      return `${base}
- Habla como asesor de una oportunidad en curso: siguiente paso concreto (propuesta, piloto, reunión con decisores), riesgos a despejar y plazo.`;
    case "cliente":
      return `${base}
- Tono de relación existente: no vendas en frío. Refuerza resultados, pregunta por nuevas necesidades y plantea ampliación o complemento.`;
    default:
      return `${base}
- Primer contacto: preséntate, conecta con una observación concreta y pide una conversación corta.`;
  }
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
  lines.push(
    `- Coincidencia del portafolio: ${context.solution_match_explanation}`
  );
  lines.push(
    `- Solución principal para el mensaje: ${formatSolutionNames(context.recommended_solutions)[0] ?? context.company_profile.tagline}`
  );
  if (context.recommended_solutions[1]) {
    lines.push(
      `- Solución complementaria (opcional): ${formatSolutionNames(context.recommended_solutions)[1]}`
    );
  }

  lines.push("", "### Etapa e historial del contacto");
  lines.push(`- Situación: ${context.history.stage_summary}`);
  lines.push(`- Enfoque: ${context.history.approach} — ${context.history.approach_reason}`);
  if (context.history.generated.length) {
    lines.push("- Mensajes IA generados antes (más reciente primero):");
    for (const item of context.history.generated) {
      const used = item.used_at ? "copiado por el vendedor" : "solo generado";
      lines.push(
        `  · ${shortDate(item.created_at)} · ${MESSAGE_CHANNEL_LABELS[item.channel] ?? item.channel} · «${item.headline}» (${used})`
      );
    }
  }
  if (context.history.whatsapp.length) {
    lines.push("- Últimos mensajes de WhatsApp (recibidos por la plataforma):");
    for (const item of context.history.whatsapp) {
      const who = item.direction === "inbound" ? "prospecto" : "IAC";
      lines.push(`  · ${shortDate(item.created_at)} · ${who}: ${item.content.slice(0, 140)}`);
    }
  }
  if (!context.history.generated.length && !context.history.whatsapp.length) {
    lines.push("- Sin mensajes previos registrados.");
  }

  if (context.buyer_persona) {
    const persona = context.buyer_persona;
    lines.push("", "### Buyer persona (configurado en Conocimiento)");
    lines.push(`- Perfil: ${persona.name}`);
    if (persona.role) lines.push(`- Rol típico: ${persona.role}`);
    if (persona.sector) lines.push(`- Sector: ${persona.sector}`);
    if (persona.characteristics) lines.push(`- Características del cliente: ${persona.characteristics}`);
    if (persona.value_for_client) {
      lines.push(`- Qué genera valor para este cliente: ${persona.value_for_client}`);
    }
    lines.push("- El mensaje debe articular ESE valor, no un valor genérico.");
  }

  return lines.join("\n");
}
