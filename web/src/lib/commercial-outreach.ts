import { getMistralModel, isMistralConfigured } from "./smart-search";
import { formatPortfolioForPrompt, IAC_COMPANY_PROFILE } from "./iac-portfolio-knowledge";
import {
  formatProspectContextBlock,
  gatherProspectContext,
  type ProspectContext,
  type ProspectInput,
} from "./prospect-context";

export type OutreachChannel = "call" | "email";
export type OutreachInput = ProspectInput;

export type OutreachPersonalization = {
  company_insight: string;
  iac_solutions: string[];
  intel_sources: string[];
  company_domain: string | null;
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

export type OutreachResult = ColdCallResult | ColdEmailResult;

export class OutreachError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "OutreachError";
  }
}

const COMMERCIAL_RULES = `Reglas comerciales (obligatorias):
- Español profesional, directo y cercano. Sin hype ni promesas irreales.
- Personaliza con cargo, empresa, país y AL MENOS UNA observación concreta del sitio web o sector del prospecto (si hay datos).
- Menciona EXPLÍCITAMENTE 1-2 soluciones IAC del portafolio recomendado, con métricas orientativas del portafolio (no inventes casos de clientes nombrados).
- Conecta el dolor típico del cargo con la solución IAC más relevante.
- Si no hay datos web, sé específico con el rol y la empresa; no uses frases genéricas tipo "ayudamos a empresas como la suya".
- No inventes noticias, financieros ni proyectos internos del prospecto.
- Firma mentalmente como ${IAC_COMPANY_PROFILE.contact.consultant}, ${IAC_COMPANY_PROFILE.name} (${IAC_COMPANY_PROFILE.contact.web}).`;

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
  };
}

function buildCallPrompt(input: OutreachInput, context: ProspectContext): string {
  return `Eres ${IAC_COMPANY_PROFILE.contact.consultant}, consultor comercial senior de ${IAC_COMPANY_PROFILE.name}.

PORTAFOLIO IAC (oferta real — úsala como base, no inventes servicios fuera de esto):
${formatPortfolioForPrompt(context.recommended_solutions)}

CONTEXTO DEL PROSPECTO:
${formatProspectContextBlock(input, context)}

Genera un guion de PRIMERA llamada en frío ultra personalizado.

Responde SOLO JSON válido (sin markdown):
{
  "company_hook": "1 oración con observación específica sobre la empresa (web, sector o rol). Si no hay web, menciona su cargo/empresa con detalle concreto.",
  "headline": "enfoque comercial en máx 12 palabras, mencionando empresa o dolor detectado",
  "opening_line": "apertura 2-3 oraciones: saludo con nombre, referencia a la observación de empresa_hook, y puente hacia una solución IAC concreta",
  "why_now": "1-2 oraciones: urgencia operativa ligada a su sector o a lo visto en su web",
  "value_points": ["beneficio 1 citando solución IAC + métrica del portafolio", "beneficio 2 ligado a su cargo", "beneficio 3 conectado con su empresa o sector"],
  "discovery_question": "pregunta abierta que demuestre que investigaste su contexto",
  "closing": "cierre para agendar 15 min con ${IAC_COMPANY_PROFILE.contact.consultant} (1-2 oraciones)",
  "objection_tip": "respuesta breve si dice 'no tengo tiempo' o 'ya tenemos proveedor', mencionando complemento con IAC"
}

${COMMERCIAL_RULES}
- opening_line debe incluir referencia explícita a company_hook o al sector de la empresa.`;
}

function buildEmailPrompt(input: OutreachInput, context: ProspectContext): string {
  return `Eres ${IAC_COMPANY_PROFILE.contact.consultant}, consultor comercial senior de ${IAC_COMPANY_PROFILE.name}.

PORTAFOLIO IAC (oferta real):
${formatPortfolioForPrompt(context.recommended_solutions)}

CONTEXTO DEL PROSPECTO:
${formatProspectContextBlock(input, context)}

Genera un correo en frío ultra personalizado.

Responde SOLO JSON válido (sin markdown):
{
  "company_hook": "1 oración con observación específica sobre la empresa (web, sector o rol)",
  "subject_line": "asunto personalizado con empresa o dolor, máx 9 palabras, sin clickbait",
  "preview_text": "preheader 45-80 caracteres",
  "headline": "enfoque interno en máx 12 palabras",
  "greeting": "saludo con nombre",
  "hook": "2 oraciones: company_hook + problema del cargo enlazado a solución IAC concreta",
  "value_bullets": ["bullet con solución IAC + métrica portafolio", "bullet personalizado al rol", "bullet conectado a su empresa"],
  "body_close": "1-2 oraciones consultivas antes del CTA",
  "cta": "CTA de baja fricción (15 min con ${IAC_COMPANY_PROFILE.contact.consultant})",
  "ps_line": "P.S. breve con beneficio IAC principal o referencia a su sector"
}

${COMMERCIAL_RULES}
- El hook debe integrar company_hook de forma natural.`;
}

function ruleBasedCall(input: OutreachInput, context: ProspectContext): ColdCallResult {
  const firstName = input.nombre.split(/\s+/)[0] || input.nombre;
  const company = input.empresa?.trim() || "su empresa";
  const role = input.cargo?.trim() || "su área";
  const primary = context.recommended_solutions[0];
  const secondary = context.recommended_solutions[1];
  const webRef = context.company_web_title
    ? `Revisé ${context.company_domain ?? "su sitio"} y vi que se posicionan en «${context.company_web_title}». `
    : "";

  const personalization = buildPersonalization(
    context,
    webRef || `Perfil de ${role} en ${company} en ${input.pais || "LATAM"}.`
  );

  return {
    channel: "call",
    headline: `${primary?.name?.split("(")[0]?.trim() ?? "Automatización"} para ${company}`,
    opening_line: `Hola ${firstName}, soy ${IAC_COMPANY_PROFILE.contact.consultant} de ${IAC_COMPANY_PROFILE.name}. ${webRef}Como ${role}, muchos equipos en su sector están priorizando ${primary?.talking_points[0]?.toLowerCase() ?? "automatización"} — justo donde ayudamos con ${primary?.name ?? "nuestro Centro de Automatización"}.`,
    why_now: `En ${input.pais || "la región"}, perfiles como el suyo buscan resultados en semanas: ${primary?.metrics[0] ?? "menos tiempo operativo"} sin proyectos eternos.`,
    value_points: [
      `${primary?.name ?? "Automatización"}: ${primary?.metrics[0] ?? "hasta 70% menos tiempo operativo"}`,
      secondary
        ? `${secondary.name}: ${secondary.metrics[0]}`
        : `Formación consultiva en IA para que ${role} adopte casos de uso reales`,
      `Integración con ERP/CRM que ya usan en ${company}`,
    ],
    discovery_question: webRef
      ? `¿Qué proceso en ${company} les está consumiendo más horas manuales hoy, considerando lo que hacen en su operación?`
      : `¿Cuál es hoy el cuello de botella operativo más costoso para usted como ${role}?`,
    closing: `¿Le funcionaría 15 minutos esta semana conmigo para ver si ${primary?.name ?? "automatización IAC"} encaja? Puedo martes o jueves en la mañana.`,
    objection_tip: `Si no tiene tiempo: "Son 2 minutos para validar si vale una conversación de 15." Si ya tienen proveedor: "Muchos nos complementan en RPA, predicción de demanda o agentes IA donde otros no llegan."`,
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
  const webRef = context.company_web_summary
    ? context.company_web_summary.slice(0, 120)
    : context.company_web_title
      ? `su enfoque en «${context.company_web_title}»`
      : `su rol como ${role}`;

  const personalization = buildPersonalization(context, webRef);

  return {
    channel: "email",
    subject_line: `${company}: ${primary?.name?.split("(")[0]?.trim().slice(0, 20) ?? "eficiencia"} para ${role.split(" ")[0]}`,
    preview_text: `Idea para ${firstName} — ${primary?.talking_points[0]?.slice(0, 40) ?? "automatización IAC"}`,
    headline: `${primary?.name ?? "Solución IAC"} para ${company}`,
    greeting: `Hola ${firstName},`,
    hook: `Le escribo porque, al revisar ${webRef}, veo una oportunidad clara para ${role} en ${company}: ${primary?.summary ?? "automatizar procesos críticos con IA y RPA"} con resultados medibles en semanas.`,
    value_bullets: [
      `${primary?.name}: ${primary?.metrics[0] ?? "impacto operativo medible"}`,
      secondary ? `${secondary.name}: ${secondary.metrics[0]}` : "Entrenamiento consultivo en IA para su equipo",
      `${IAC_COMPANY_PROFILE.experience} — integración con ERP/CRM existente`,
    ],
    body_close: `No busco vender en este correo: solo validar si este enfoque encaja con una prioridad actual de ${company}.`,
    cta: `¿Le funciona 15 minutos con ${IAC_COMPANY_PROFILE.contact.consultant}? Responda con un horario y preparo un ejemplo aplicado a ${company}.`,
    ps_line: `P.D.: Puedo compartir en 3 líneas cómo aplicaríamos ${primary?.name ?? "automatización IAC"} a su operación.`,
    personalization,
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
          content: `Eres ${IAC_COMPANY_PROFILE.contact.consultant}, asesor comercial de ${IAC_COMPANY_PROFILE.name}. Respondes únicamente JSON válido en español. ${systemExtra}`,
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
    headline: String(parsed.headline ?? "Guion de llamada en frío").trim(),
    opening_line: String(parsed.opening_line ?? "").trim(),
    why_now: String(parsed.why_now ?? "").trim(),
    value_points: valuePoints.length
      ? valuePoints
      : context.recommended_solutions.map((s) => `${s.name}: ${s.metrics[0]}`),
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
    headline: String(parsed.headline ?? "Correo en frío").trim(),
    greeting: String(parsed.greeting ?? "").trim(),
    hook: String(parsed.hook ?? "").trim(),
    value_bullets: bullets.length
      ? bullets
      : context.recommended_solutions.map((s) => `${s.name}: ${s.metrics[0]}`),
    body_close: String(parsed.body_close ?? "").trim(),
    cta: String(parsed.cta ?? "").trim(),
    ps_line: String(parsed.ps_line ?? "").trim(),
    personalization: buildPersonalization(context, companyHook),
  };
}

export async function generateOutreachMessage(
  input: OutreachInput,
  channel: OutreachChannel
): Promise<OutreachResult> {
  const nombre = input.nombre?.trim();
  if (!nombre) throw new OutreachError("Nombre del contacto requerido.");

  const context = await gatherProspectContext(input);

  if (!isMistralConfigured()) {
    return channel === "email" ? ruleBasedEmail(input, context) : ruleBasedCall(input, context);
  }

  const model = getMistralModel();
  if (channel === "email") {
    const content = await callMistral(
      buildEmailPrompt(input, context),
      "Escribes cold emails B2B con datos del prospecto y soluciones concretas del portafolio IAC."
    );
    return { channel: "email", ...parseEmailJson(content, context), source: "mistral", model };
  }

  const content = await callMistral(
    buildCallPrompt(input, context),
    "Escribes guiones de llamada B2B con investigación del prospecto y soluciones concretas del portafolio IAC."
  );
  return { channel: "call", ...parseCallJson(content, context), source: "mistral", model };
}
