import { getMistralModel, isMistralConfigured } from "./smart-search";
import { formatPortfolioForPrompt, solutionEvidence } from "./iac-portfolio-knowledge";
import {
  approachRules,
  formatProspectContextBlock,
  gatherProspectContext,
  type OutreachApproach,
  type ProspectContext,
  type ProspectInput,
} from "./prospect-context";

/**
 * Canales del Mensaje IA. Los tres generan texto para que el vendedor lo copie:
 * la plataforma NO envía correos, llamadas ni WhatsApp.
 */
export type OutreachChannel = "call" | "email" | "whatsapp";
export type OutreachInput = ProspectInput;

export const WHATSAPP_MAX_CHARS = 450;
export const WHATSAPP_FOLLOW_UP_MAX_CHARS = 220;

/** Base de la evidencia usada: documentos cargados (hechos) o catálogo en código (referencia). */
export type KnowledgeBasis = "documentos" | "referencia interna";

export type OutreachPersonalization = {
  company_insight: string;
  iac_solutions: string[];
  intel_sources: string[];
  company_domain: string | null;
  knowledge_basis: KnowledgeBasis;
  approach: OutreachApproach;
  stage_summary: string;
};

export type ColdCallResult = {
  channel: "call";
  headline: string;
  opening_line: string;
  why_now: string;
  value_points: string[];
  discovery_question: string;
  closing: string;
  objection_tip: string;
  personalization: OutreachPersonalization;
  source: "mistral" | "rules";
  model?: string;
};

export type ColdEmailResult = {
  channel: "email";
  subject_line: string;
  preview_text: string;
  headline: string;
  greeting: string;
  hook: string;
  value_bullets: string[];
  body_close: string;
  cta: string;
  ps_line: string;
  personalization: OutreachPersonalization;
  source: "mistral" | "rules";
  model?: string;
};

export type WhatsAppDraftResult = {
  channel: "whatsapp";
  headline: string;
  /** Texto listo para copiar (máx. WHATSAPP_MAX_CHARS). */
  message: string;
  /** Recordatorio corto para enviar días después si no responde. */
  follow_up: string;
  personalization: OutreachPersonalization;
  source: "mistral" | "rules";
  model?: string;
};

export type OutreachResult = ColdCallResult | ColdEmailResult | WhatsAppDraftResult;

export class OutreachError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "OutreachError";
  }
}

export function isOutreachChannel(value: unknown): value is OutreachChannel {
  return value === "call" || value === "email" || value === "whatsapp";
}

/** Título corto que se guarda como resumen del mensaje en el historial. */
export function outreachHeadline(result: OutreachResult): string {
  if (result.channel === "email") return result.subject_line || result.headline;
  return result.headline;
}

/** Texto plano del mensaje (lo que copia el vendedor), útil para historial y pruebas. */
export function outreachPlainText(result: OutreachResult): string {
  if (result.channel === "whatsapp") return result.message;
  if (result.channel === "email") {
    return [
      `Asunto: ${result.subject_line}`,
      "",
      result.greeting,
      "",
      result.hook,
      "",
      ...result.value_bullets.map((b) => `• ${b}`),
      "",
      result.body_close,
      "",
      result.cta,
      "",
      result.ps_line,
    ].join("\n");
  }
  return [
    result.headline,
    "",
    `Apertura:\n${result.opening_line}`,
    "",
    `Por qué ahora:\n${result.why_now}`,
    "",
    "Valor para el cliente:",
    ...result.value_points.map((p) => `• ${p}`),
    "",
    `Pregunta de descubrimiento:\n${result.discovery_question}`,
    "",
    `Cierre:\n${result.closing}`,
    "",
    `Si objeta:\n${result.objection_tip}`,
  ].join("\n");
}

function knowledgeBasis(context: ProspectContext): KnowledgeBasis {
  const fromDocs =
    context.knowledge_from_documents ||
    context.recommended_solutions.some((s) => solutionEvidence(s) === "documento");
  return fromDocs ? "documentos" : "referencia interna";
}

/** Cómo puede citarse una métrica según su evidencia (hecho vs hipótesis). */
function metricLine(solution: ProspectContext["recommended_solutions"][number] | undefined, fallback: string): string {
  if (!solution) return fallback;
  const metric = solution.metrics[0];
  if (!metric) return `${solution.name}: ${solution.talking_points[0] ?? fallback}`;
  return solutionEvidence(solution) === "documento"
    ? `${solution.name}: ${metric}`
    : `${solution.name}: en proyectos similares hemos visto ${metric.charAt(0).toLowerCase()}${metric.slice(1)} (referencia, se valida en cada caso)`;
}

function commercialRules(context: ProspectContext): string {
  const firm = context.company_profile;
  const demandRule = context.knowledge_from_documents
    ? "- Ofrece SOLO servicios del portafolio activo y de los extractos de documentos. No inventes productos ni casos de clientes."
    : "- NO mencionar «Predicción de Demanda» salvo que aparezca como solución principal o complementaria en el portafolio recomendado para este prospecto.";
  const personaRule = context.buyer_persona?.value_for_client
    ? `- Este contacto encaja con el buyer persona «${context.buyer_persona.name}». El mensaje debe responder qué genera valor para él: ${context.buyer_persona.value_for_client}`
    : "- Conecta el dolor detectado (cargo, sector, web, intereses) con la solución principal recomendada.";
  const erpRule = context.knowledge_from_documents
    ? personaRule
    : `${personaRule}
- Si el contexto habla de ERP, software a medida, procesos o automatización → prioriza Centro de Automatización, no predicción de demanda.`;
  return `Reglas comerciales (obligatorias):
- Español profesional, directo y cercano. Sin hype ni promesas irreales.
- Personaliza con cargo, empresa, país y AL MENOS UNA observación concreta del sitio web, notas o contexto de prospección.
- El eje del mensaje DEBE ser la SOLUCIÓN PRINCIPAL indicada en el portafolio recomendado (primera de la lista). No cambies de solución por iniciativa propia.
${demandRule}
- Menciona 1-2 soluciones SOLO de la lista recomendada. Las cifras marcadas como HECHOS pueden afirmarse citando su fuente; las de REFERENCIA INTERNA van en condicional u orientativo («en proyectos similares hemos visto hasta…»), nunca como garantía.
${erpRule}
- Si no hay datos web, sé específico con el rol, la empresa y el contexto de prospección; evita frases genéricas.
- No inventes noticias, financieros ni proyectos internos del prospecto. No inventes respuestas previas del prospecto.
${approachRules(context.history)}
- Firma mentalmente como ${firm.contact.consultant}, ${firm.name} (${firm.contact.web}).`;
}

function portfolioBlock(context: ProspectContext): string {
  return formatPortfolioForPrompt(context.recommended_solutions, {
    company: context.company_profile,
    excerpt: context.knowledge_excerpt,
    fromDocuments: context.knowledge_from_documents,
  });
}

function buildPersonalization(
  context: ProspectContext,
  companyHook?: string
): OutreachPersonalization {
  const insight =
    companyHook?.trim() ||
    (context.company_web_summary
      ? context.company_web_summary.slice(0, 280)
      : context.company_web_title
        ? `Sitio corporativo: ${context.company_web_title}`
        : "Sin sitio web analizado; enfoque basado en cargo y sector.");

  return {
    company_insight: insight,
    iac_solutions: context.recommended_solutions.map((s) => s.name),
    intel_sources: context.intel_sources,
    company_domain: context.company_domain,
    knowledge_basis: knowledgeBasis(context),
    approach: context.history.approach,
    stage_summary: context.history.stage_summary,
  };
}

function buildCallPrompt(input: OutreachInput, context: ProspectContext): string {
  const firm = context.company_profile;
  return `Eres ${firm.contact.consultant}, consultor comercial senior de ${firm.name}.

PORTAFOLIO ACTIVO (oferta real — úsala como base, no inventes servicios fuera de esto):
${portfolioBlock(context)}

CONTEXTO DEL PROSPECTO:
${formatProspectContextBlock(input, context)}

Genera un guion de llamada ultra personalizado y coherente con el ENFOQUE indicado en el historial.

Responde SOLO JSON válido (sin markdown):
{
  "company_hook": "1 oración con observación específica sobre la empresa (web, sector o rol). Si no hay web, menciona su cargo/empresa con detalle concreto.",
  "headline": "enfoque comercial en máx 12 palabras, mencionando empresa o dolor detectado",
  "opening_line": "apertura 2-3 oraciones: saludo con nombre, referencia a la observación de company_hook (o al contacto previo si es seguimiento), y puente hacia una solución IAC concreta",
  "why_now": "1-2 oraciones: urgencia operativa ligada a su sector o a lo visto en su web",
  "value_points": ["beneficio 1 citando la SOLUCIÓN PRINCIPAL + métrica según su evidencia", "beneficio 2 ligado a su cargo y contexto", "beneficio 3 conectado con su empresa o sector"],
  "discovery_question": "pregunta abierta que demuestre que investigaste su contexto",
  "closing": "cierre para agendar 15 min con ${firm.contact.consultant} (1-2 oraciones)",
  "objection_tip": "respuesta breve si dice 'no tengo tiempo' o 'ya tenemos proveedor', mencionando complemento con ${firm.name}"
}

${commercialRules(context)}
- opening_line debe incluir referencia explícita a company_hook, al sector de la empresa o al contacto previo.`;
}

function buildEmailPrompt(input: OutreachInput, context: ProspectContext): string {
  const firm = context.company_profile;
  return `Eres ${firm.contact.consultant}, consultor comercial senior de ${firm.name}.

PORTAFOLIO ACTIVO (oferta real):
${portfolioBlock(context)}

CONTEXTO DEL PROSPECTO:
${formatProspectContextBlock(input, context)}

Genera un correo ultra personalizado y coherente con el ENFOQUE indicado en el historial.

Responde SOLO JSON válido (sin markdown):
{
  "company_hook": "1 oración con observación específica sobre la empresa (web, sector o rol)",
  "subject_line": "asunto personalizado con empresa o dolor, máx 9 palabras, sin clickbait",
  "preview_text": "preheader 45-80 caracteres",
  "headline": "enfoque interno en máx 12 palabras",
  "greeting": "saludo con nombre",
  "hook": "2 oraciones: company_hook (o referencia al contacto previo) + problema del cargo enlazado a solución IAC concreta",
  "value_bullets": ["bullet con la SOLUCIÓN PRINCIPAL + métrica según su evidencia", "bullet personalizado al rol y contexto", "bullet conectado a su empresa"],
  "body_close": "1-2 oraciones consultivas antes del CTA",
  "cta": "CTA de baja fricción (15 min con ${firm.contact.consultant})",
  "ps_line": "P.S. breve con beneficio principal o referencia a su sector"
}

${commercialRules(context)}
- El hook debe integrar company_hook de forma natural.`;
}

function buildWhatsAppPrompt(input: OutreachInput, context: ProspectContext): string {
  const firm = context.company_profile;
  return `Eres ${firm.contact.consultant}, consultor comercial senior de ${firm.name}.

PORTAFOLIO ACTIVO (oferta real):
${portfolioBlock(context)}

CONTEXTO DEL PROSPECTO:
${formatProspectContextBlock(input, context)}

Genera un mensaje de WhatsApp B2B que el vendedor copiará y enviará desde su propio teléfono. Coherente con el ENFOQUE indicado en el historial.

Responde SOLO JSON válido (sin markdown):
{
  "company_hook": "1 oración con observación específica sobre la empresa (web, sector o rol)",
  "headline": "enfoque del mensaje en máx 10 palabras",
  "message": "máx ${WHATSAPP_MAX_CHARS} caracteres, 2-4 frases: saludo con nombre y presentación breve (quién eres y de qué empresa), UNA observación concreta, UN valor de la solución principal y UNA pregunta de cierre fácil de responder. Sin emojis, sin enlaces, sin mayúsculas sostenidas.",
  "follow_up": "máx ${WHATSAPP_FOLLOW_UP_MAX_CHARS} caracteres: recordatorio amable para 3 días después si no responde, con salida fácil"
}

${commercialRules(context)}
- Tono conversacional: una persona escribiendo a otra, no un boletín.`;
}

function ruleBasedCall(input: OutreachInput, context: ProspectContext): ColdCallResult {
  const firstName = input.nombre.split(/\s+/)[0] || input.nombre;
  const company = input.empresa?.trim() || "su empresa";
  const role = input.cargo?.trim() || "su área";
  const primary = context.recommended_solutions[0];
  const secondary = context.recommended_solutions[1];
  const approach = context.history.approach;
  const webRef = context.company_web_title
    ? `Revisé ${context.company_domain ?? "su sitio"} y vi que se posicionan en «${context.company_web_title}». `
    : "";
  const followRef =
    approach === "seguimiento" || approach === "reactivación"
      ? "Le escribí hace unos días y quería retomar brevemente. "
      : approach === "siguiente paso"
        ? "Gracias por el interés que mostró; quería concretar el siguiente paso. "
        : approach === "cliente"
          ? "Como ya trabajamos juntos, quería revisar cómo van los resultados y qué viene. "
          : approach === "oportunidad"
            ? "Sobre la oportunidad que tenemos abierta, quería avanzar en el siguiente paso. "
            : "";

  const personalization = buildPersonalization(
    context,
    webRef || `Perfil de ${role} en ${company} en ${input.pais || "LATAM"}.`
  );

  return {
    channel: "call",
    headline: `${primary?.name?.split("(")[0]?.trim() ?? "Automatización"} para ${company}`,
    opening_line: `Hola ${firstName}, soy ${context.company_profile.contact.consultant} de ${context.company_profile.name}. ${followRef}${webRef}Como ${role}, muchos equipos en su sector están priorizando ${primary?.talking_points[0]?.toLowerCase() ?? "eficiencia operativa"} — justo donde ayudamos con ${primary?.name ?? context.company_profile.tagline}.`,
    why_now: `En ${input.pais || "la región"}, perfiles como el suyo buscan resultados en semanas, sin proyectos eternos.`,
    value_points: [
      metricLine(primary, "menos tiempo operativo"),
      secondary
        ? metricLine(secondary, "impacto medible")
        : `Formación consultiva en IA para que ${role} adopte casos de uso reales`,
      `Integración con ERP/CRM que ya usan en ${company}`,
    ],
    discovery_question: webRef
      ? `¿Qué proceso en ${company} les está consumiendo más horas manuales hoy, considerando lo que hacen en su operación?`
      : `¿Cuál es hoy el cuello de botella operativo más costoso para usted como ${role}?`,
    closing:
      approach === "reactivación"
        ? `Si no es prioridad ahora, lo entiendo; si lo es, 15 minutos esta semana bastan para ver si ${primary?.name ?? "automatización IAC"} encaja.`
        : `¿Le funcionaría 15 minutos esta semana conmigo para ver si ${primary?.name ?? "automatización IAC"} encaja? Puedo martes o jueves en la mañana.`,
    objection_tip: `Si no tiene tiempo: "Son 2 minutos para validar si vale una conversación de 15." Si ya tienen proveedor: "Muchos nos complementan en ${primary?.name?.split("(")[0]?.trim() ?? "automatización y RPA"} donde otros no llegan."`,
    personalization,
    source: "rules",
  };
}

function ruleBasedEmail(input: OutreachInput, context: ProspectContext): ColdEmailResult {
  const firstName = input.nombre.split(/\s+/)[0] || input.nombre;
  const company = input.empresa?.trim() || "su empresa";
  const role = input.cargo?.trim() || "su área";
  const primary = context.recommended_solutions[0];
  const secondary = context.recommended_solutions[1];
  const approach = context.history.approach;
  const webRef = context.company_web_summary
    ? context.company_web_summary.slice(0, 120)
    : context.company_web_title
      ? `su enfoque en «${context.company_web_title}»`
      : `su rol como ${role}`;

  const personalization = buildPersonalization(context, webRef);
  const followIntro =
    approach === "seguimiento" || approach === "reactivación"
      ? "Retomo mi mensaje anterior por si quedó enterrado en la bandeja. "
      : approach === "siguiente paso"
        ? "Gracias por el interés; le propongo concretar el siguiente paso. "
        : "";

  return {
    channel: "email",
    subject_line:
      approach === "seguimiento" || approach === "reactivación"
        ? `Re: ${company} — ${primary?.name?.split("(")[0]?.trim().slice(0, 24) ?? "eficiencia"}`
        : `${company}: ${primary?.name?.split("(")[0]?.trim().slice(0, 20) ?? "eficiencia"} para ${role.split(" ")[0]}`,
    preview_text: `Idea para ${firstName} — ${primary?.talking_points[0]?.slice(0, 40) ?? "automatización IAC"}`,
    headline: `${primary?.name ?? "Solución IAC"} para ${company}`,
    greeting: `Hola ${firstName},`,
    hook: `${followIntro}Le escribo porque, al revisar ${webRef}, veo una oportunidad clara para ${role} en ${company}: ${primary?.summary ?? "automatizar procesos críticos con IA y RPA"} con resultados medibles en semanas.`,
    value_bullets: [
      metricLine(primary, "impacto operativo medible"),
      secondary ? metricLine(secondary, "impacto medible") : "Entrenamiento consultivo en IA para su equipo",
      `${context.company_profile.experience} — integración con ERP/CRM existente`,
    ],
    body_close: `No busco vender en este correo: solo validar si este enfoque encaja con una prioridad actual de ${company}.`,
    cta: `¿Le funciona 15 minutos con ${context.company_profile.contact.consultant}? Responda con un horario y preparo un ejemplo aplicado a ${company}.`,
    ps_line: `P.D.: Puedo compartir en 3 líneas cómo aplicaríamos ${primary?.name ?? "automatización IAC"} a su operación.`,
    personalization,
    source: "rules",
  };
}

function clamp(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return (lastStop > max * 0.6 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}…`).trim();
}

function ruleBasedWhatsApp(input: OutreachInput, context: ProspectContext): WhatsAppDraftResult {
  const firstName = input.nombre.split(/\s+/)[0] || input.nombre;
  const company = input.empresa?.trim() || "su empresa";
  const role = input.cargo?.trim() || "su área";
  const primary = context.recommended_solutions[0];
  const consultant = context.company_profile.contact.consultant;
  const firm = context.company_profile.name;
  const approach = context.history.approach;
  const hook = context.company_web_title
    ? `vi en su sitio que se enfocan en «${context.company_web_title}»`
    : `veo que lidera ${role} en ${company}`;
  const value = primary?.talking_points[0]?.toLowerCase() ?? "reducir trabajo manual con automatización e IA";

  let message: string;
  if (approach === "reactivación") {
    message = `Hola ${firstName}, soy ${consultant} de ${firm}. Le escribí hace unos días sobre ${value} en ${company}. Si no es prioridad ahora, lo entiendo; si lo es, ¿le sirve una llamada corta esta semana?`;
  } else if (approach === "seguimiento") {
    message = `Hola ${firstName}, soy ${consultant} de ${firm}. Retomo nuestro contacto anterior: ${hook}, y creo que ${primary?.name ?? "nuestra solución"} puede ayudarle a ${value}. ¿Tiene 15 minutos esta semana para revisarlo?`;
  } else if (approach === "siguiente paso") {
    message = `Hola ${firstName}, gracias por su interés en ${primary?.name ?? "nuestra propuesta"} para ${company}. ¿Le propongo martes o jueves en la mañana para concretar el siguiente paso? Soy ${consultant}, de ${firm}.`;
  } else if (approach === "cliente") {
    message = `Hola ${firstName}, soy ${consultant} de ${firm}. Quería saber cómo van los resultados en ${company} y si hay algún nuevo frente donde podamos apoyar. ¿Le viene bien una llamada corta esta semana?`;
  } else if (approach === "oportunidad") {
    message = `Hola ${firstName}, soy ${consultant} de ${firm}. Sobre la oportunidad que tenemos abierta en ${company}, ¿avanzamos con el siguiente paso esta semana? Dígame qué día le funciona y preparo lo necesario.`;
  } else {
    message = `Hola ${firstName}, soy ${consultant} de ${firm}. ${hook.charAt(0).toUpperCase()}${hook.slice(1)}, y ayudamos a equipos como el suyo a ${value} con ${primary?.name ?? "automatización e IA"}. ¿Le parece si lo conversamos 15 minutos esta semana?`;
  }

  return {
    channel: "whatsapp",
    headline: `${primary?.name?.split("(")[0]?.trim() ?? "Automatización"} para ${company}`,
    message: clamp(message, WHATSAPP_MAX_CHARS),
    follow_up: clamp(
      `Hola ${firstName}, ¿pudo ver mi mensaje? Si prefiere, le envío un resumen de dos líneas por este medio y usted decide. Saludos, ${consultant}.`,
      WHATSAPP_FOLLOW_UP_MAX_CHARS
    ),
    personalization: buildPersonalization(context, hook),
    source: "rules",
  };
}

async function callMistral(prompt: string, systemExtra: string): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  if (!apiKey) throw new OutreachError("MISTRAL_API_KEY no configurada.");

  const model = getMistralModel();
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.38,
      max_tokens: 1400,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Eres un asesor comercial B2B. Respondes únicamente JSON válido en español. ${systemExtra}`,
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) throw new OutreachError("API key de Mistral inválida.", 401);
    if (res.status === 429) {
      throw new OutreachError("Límite de Mistral alcanzado. Intenta en unos segundos.", 429);
    }
    throw new OutreachError(`Mistral respondió ${res.status}: ${text.slice(0, 180)}`, res.status);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new OutreachError("Mistral no devolvió contenido.");
  return content;
}

function parseJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new OutreachError("Respuesta de IA no válida.");
    return JSON.parse(match[0]) as Record<string, unknown>;
  }
}

function parseCallJson(
  raw: string,
  context: ProspectContext
): Omit<ColdCallResult, "source" | "model" | "channel"> {
  const parsed = parseJson(raw);
  const valuePoints = Array.isArray(parsed.value_points)
    ? parsed.value_points.map(String).filter(Boolean).slice(0, 4)
    : [];
  const companyHook = String(parsed.company_hook ?? "").trim();

  return {
    headline: String(parsed.headline ?? "Guion de llamada").trim(),
    opening_line: String(parsed.opening_line ?? "").trim(),
    why_now: String(parsed.why_now ?? "").trim(),
    value_points: valuePoints.length
      ? valuePoints
      : context.recommended_solutions.map((s) => metricLine(s, "impacto medible")),
    discovery_question: String(parsed.discovery_question ?? "").trim(),
    closing: String(parsed.closing ?? "").trim(),
    objection_tip: String(parsed.objection_tip ?? "").trim(),
    personalization: buildPersonalization(context, companyHook),
  };
}

function parseEmailJson(
  raw: string,
  context: ProspectContext
): Omit<ColdEmailResult, "source" | "model" | "channel"> {
  const parsed = parseJson(raw);
  const bullets = Array.isArray(parsed.value_bullets)
    ? parsed.value_bullets.map(String).filter(Boolean).slice(0, 4)
    : [];
  const companyHook = String(parsed.company_hook ?? "").trim();

  return {
    subject_line: String(parsed.subject_line ?? "Idea breve para su equipo").trim(),
    preview_text: String(parsed.preview_text ?? "").trim(),
    headline: String(parsed.headline ?? "Correo comercial").trim(),
    greeting: String(parsed.greeting ?? "").trim(),
    hook: String(parsed.hook ?? "").trim(),
    value_bullets: bullets.length
      ? bullets
      : context.recommended_solutions.map((s) => metricLine(s, "impacto medible")),
    body_close: String(parsed.body_close ?? "").trim(),
    cta: String(parsed.cta ?? "").trim(),
    ps_line: String(parsed.ps_line ?? "").trim(),
    personalization: buildPersonalization(context, companyHook),
  };
}

function parseWhatsAppJson(
  raw: string,
  input: OutreachInput,
  context: ProspectContext
): Omit<WhatsAppDraftResult, "source" | "model" | "channel"> {
  const parsed = parseJson(raw);
  const companyHook = String(parsed.company_hook ?? "").trim();
  const message = String(parsed.message ?? "").trim();
  if (!message) {
    // Si la IA no devolvió texto, el modo básico garantiza un mensaje utilizable.
    const fallback = ruleBasedWhatsApp(input, context);
    return {
      headline: fallback.headline,
      message: fallback.message,
      follow_up: fallback.follow_up,
      personalization: buildPersonalization(context, companyHook || undefined),
    };
  }
  return {
    headline: String(parsed.headline ?? "Mensaje de WhatsApp").trim(),
    message: clamp(message, WHATSAPP_MAX_CHARS),
    follow_up: clamp(String(parsed.follow_up ?? "").trim(), WHATSAPP_FOLLOW_UP_MAX_CHARS),
    personalization: buildPersonalization(context, companyHook),
  };
}

export async function generateOutreachMessage(
  input: OutreachInput,
  channel: OutreachChannel,
  ownerId: number
): Promise<OutreachResult> {
  const nombre = input.nombre?.trim();
  if (!nombre) throw new OutreachError("Nombre del contacto requerido.");

  const context = await gatherProspectContext(input, ownerId);

  if (!isMistralConfigured()) {
    if (channel === "email") return ruleBasedEmail(input, context);
    if (channel === "whatsapp") return ruleBasedWhatsApp(input, context);
    return ruleBasedCall(input, context);
  }

  const model = getMistralModel();
  const docsHint = context.knowledge_from_documents
    ? "Usa la solución principal del portafolio activo y los documentos del proyecto. No inventes servicios."
    : "Usa la solución principal del portafolio recomendado como eje. No ofrezcas Predicción de Demanda si no está en la lista recomendada.";

  if (channel === "email") {
    const content = await callMistral(buildEmailPrompt(input, context), `Escribes correos B2B. ${docsHint}`);
    return { channel: "email", ...parseEmailJson(content, context), source: "mistral", model };
  }

  if (channel === "whatsapp") {
    const content = await callMistral(
      buildWhatsAppPrompt(input, context),
      `Escribes mensajes cortos de WhatsApp B2B que el vendedor envía desde su propio teléfono. ${docsHint}`
    );
    return { channel: "whatsapp", ...parseWhatsAppJson(content, input, context), source: "mistral", model };
  }

  const content = await callMistral(buildCallPrompt(input, context), `Escribes guiones de llamada B2B. ${docsHint}`);
  return { channel: "call", ...parseCallJson(content, context), source: "mistral", model };
}
