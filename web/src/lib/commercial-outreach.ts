import { getMistralModel, isMistralConfigured } from "./smart-search";

export type OutreachChannel = "call" | "email";

export type OutreachInput = {
  nombre: string;
  cargo?: string | null;
  empresa?: string | null;
  pais?: string | null;
  email?: string | null;
  notas?: string | null;
  fuente?: string | null;
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

const IAC_CONTEXT = `IAC SAS es una empresa B2B en Colombia/LATAM. Ofrece:
- Automatización de procesos operativos y comerciales (menos trabajo manual, más velocidad)
- Adopción práctica de IA en equipos de negocio (no teoría: casos de uso reales)
- Predicción de demanda y analítica para compras, inventario y decisiones comerciales`;

const COMMERCIAL_RULES = `Reglas comerciales (obligatorias):
- Español profesional, directo y cercano. Sin hype ni promesas irreales.
- Personaliza SIEMPRE con cargo, empresa y país del contacto.
- Incluye al menos un dato o cifra orientativa (%, tiempo ahorrado, volumen de decisiones) sin inventar casos nombrados ni resultados verificados de clientes reales.
- Conecta el mensaje con el dolor típico del cargo (operaciones, ventas, logística, TI, finanzas, etc.).
- Prioriza automatización, IA aplicada o predicción de demanda según encaje con el rol.
- Sé breve: cada bloque debe poder leerse en segundos.
- No inventes noticias de la empresa ni datos financieros del prospecto.`;

function contactBlock(input: OutreachInput): string {
  return `- Nombre: ${input.nombre}
- Cargo: ${input.cargo || "No especificado"}
- Empresa: ${input.empresa || "No especificada"}
- País: ${input.pais || "Colombia/LATAM"}
${input.email ? `- Email: ${input.email}` : ""}
${input.notas ? `- Notas internas del vendedor: ${input.notas}` : ""}
${input.fuente ? `- Contexto de prospección: ${input.fuente}` : ""}`;
}

function buildCallPrompt(input: OutreachInput): string {
  return `Eres un director comercial B2B experto en llamadas en frío para IAC SAS.

${IAC_CONTEXT}

Genera un guion de PRIMERA llamada en frío para:
${contactBlock(input)}

Responde SOLO JSON válido (sin markdown):
{
  "headline": "enfoque comercial en máx 10 palabras, mencionando empresa o sector si aplica",
  "opening_line": "apertura de 2-3 oraciones: saludo con nombre, motivo de la llamada y gancho concreto para su cargo en su empresa",
  "why_now": "1-2 oraciones: por qué este perfil debería escuchar ahora (urgencia operativa o competitiva, sin alarmismo)",
  "value_points": ["beneficio 1 con dato o impacto cuantificable orientativo", "beneficio 2 ligado al cargo", "beneficio 3 sobre IA/automatización/demanda"],
  "discovery_question": "pregunta abierta para calificar dolor o prioridad",
  "closing": "cierre suave para agendar 15 min (1-2 oraciones)",
  "objection_tip": "respuesta breve si dice 'no tengo tiempo' o 'ya tenemos proveedor'"
}

${COMMERCIAL_RULES}
- opening_line + closing: máximo 90 palabras combinadas.`;
}

function buildEmailPrompt(input: OutreachInput): string {
  return `Eres un director comercial B2B experto en cold email de alta conversión para IAC SAS.

${IAC_CONTEXT}

Genera un correo electrónico en frío para:
${contactBlock(input)}

Responde SOLO JSON válido (sin markdown):
{
  "subject_line": "asunto personalizado, máx 8 palabras, sin clickbait",
  "preview_text": "texto preheader 45-70 caracteres que complemente el asunto",
  "headline": "enfoque interno del mensaje en máx 10 palabras",
  "greeting": "saludo con nombre (1 línea)",
  "hook": "2 oraciones: por qué escribes ahora y qué problema del cargo/empresa abordas",
  "value_bullets": ["bullet 1 con beneficio + dato orientativo", "bullet 2 personalizado al rol", "bullet 3 sobre resultado medible"],
  "body_close": "1-2 oraciones que conecten valor con siguiente paso, tono consultivo",
  "cta": "CTA claro y de baja fricción (ej. responder con disponibilidad o 15 min)",
  "ps_line": "línea P.S. breve con urgencia suave o recordatorio del beneficio principal"
}

${COMMERCIAL_RULES}
- Cuerpo total (hook + bullets + body_close + cta): máximo 130 palabras.
- Formato escaneable: frases cortas, sin párrafos densos.`;
}

function ruleBasedCall(input: OutreachInput): ColdCallResult {
  const firstName = input.nombre.split(/\s+/)[0] || input.nombre;
  const company = input.empresa?.trim() || "su empresa";
  const role = input.cargo?.trim() || "su área";

  return {
    channel: "call",
    headline: `Eficiencia operativa en ${company}`,
    opening_line: `Hola ${firstName}, soy de IAC SAS. Vi su rol como ${role} en ${company} y quise una conversación breve: ayudamos a equipos como el suyo a reducir hasta un 30% el tiempo en tareas manuales y a tomar decisiones de demanda con datos, no solo intuición.`,
    why_now: `En ${input.pais || "la región"}, perfiles como el suyo están priorizando automatización e IA práctica para liberar capacidad del equipo sin proyectos de años.`,
    value_points: [
      `Automatizar procesos críticos de ${role.toLowerCase()} en ${company}`,
      "Capacitar al equipo en IA aplicada a su operación diaria",
      "Mejorar proyecciones de demanda para compras, inventario o ventas",
    ],
    discovery_question: `¿Qué proceso manual o decisión sin datos les está costando más tiempo hoy en ${company}?`,
    closing: `¿Le funcionaría una llamada de 15 minutos esta semana para ver si tiene sentido para ustedes? Puedo adaptarme a martes o jueves por la mañana.`,
    objection_tip: `Si no tiene tiempo: "Entiendo, son solo 2 minutos para validar si vale una conversación de 15 minutos." Si ya tienen proveedor: "Perfecto, muchos nos usan para complementar automatización o analítica que ya tienen."`,
    source: "rules",
  };
}

function ruleBasedEmail(input: OutreachInput): ColdEmailResult {
  const firstName = input.nombre.split(/\s+/)[0] || input.nombre;
  const company = input.empresa?.trim() || "su empresa";
  const role = input.cargo?.trim() || "su área";

  return {
    channel: "email",
    subject_line: `${company}: eficiencia en ${role.split(" ")[0] || "operación"}`,
    preview_text: `Idea breve para ${firstName} sobre automatización e IA en ${company}`,
    headline: `Valor concreto para ${role} en ${company}`,
    greeting: `Hola ${firstName},`,
    hook: `Le escribo porque en ${company} los perfiles de ${role} suelen perder horas en tareas repetitivas y decisiones sin datos claros. En IAC SAS ayudamos a equipos B2B a automatizar esos procesos y usar IA con resultados en semanas, no en meses.`,
    value_bullets: [
      `Reducir trabajo manual en procesos clave de ${company}`,
      "Adoptar IA práctica sin curva de aprendizaje eterna",
      "Anticipar demanda para compras, inventario o ventas con mayor precisión",
    ],
    body_close: `No busco venderle en este correo: solo validar si este enfoque encaja con una prioridad actual de su equipo.`,
    cta: `¿Le funciona una llamada de 15 minutos esta semana? Puede responder con un horario que le quede bien.`,
    ps_line: `P.D.: Si prefiere, puedo enviarle primero un ejemplo de 3 líneas de cómo aplicaríamos esto a ${company}.`,
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
      temperature: 0.32,
      max_tokens: 1100,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Eres un asesor comercial senior de IAC SAS. Respondes únicamente JSON válido en español. ${systemExtra}`,
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

function parseCallJson(raw: string): Omit<ColdCallResult, "source" | "model" | "channel"> {
  const parsed = parseJson(raw);
  const valuePoints = Array.isArray(parsed.value_points)
    ? parsed.value_points.map(String).filter(Boolean).slice(0, 4)
    : [];

  return {
    headline: String(parsed.headline ?? "Guion de llamada en frío").trim(),
    opening_line: String(parsed.opening_line ?? "").trim(),
    why_now: String(parsed.why_now ?? "").trim(),
    value_points: valuePoints.length
      ? valuePoints
      : ["Automatización de procesos", "IA aplicada al rol", "Predicción de demanda"],
    discovery_question: String(parsed.discovery_question ?? "").trim(),
    closing: String(parsed.closing ?? "").trim(),
    objection_tip: String(parsed.objection_tip ?? "").trim(),
  };
}

function parseEmailJson(raw: string): Omit<ColdEmailResult, "source" | "model" | "channel"> {
  const parsed = parseJson(raw);
  const bullets = Array.isArray(parsed.value_bullets)
    ? parsed.value_bullets.map(String).filter(Boolean).slice(0, 4)
    : [];

  return {
    subject_line: String(parsed.subject_line ?? "Idea breve para su equipo").trim(),
    preview_text: String(parsed.preview_text ?? "").trim(),
    headline: String(parsed.headline ?? "Correo en frío").trim(),
    greeting: String(parsed.greeting ?? "").trim(),
    hook: String(parsed.hook ?? "").trim(),
    value_bullets: bullets.length
      ? bullets
      : ["Automatización operativa", "IA práctica", "Decisiones con datos"],
    body_close: String(parsed.body_close ?? "").trim(),
    cta: String(parsed.cta ?? "").trim(),
    ps_line: String(parsed.ps_line ?? "").trim(),
  };
}

export async function generateOutreachMessage(
  input: OutreachInput,
  channel: OutreachChannel
): Promise<OutreachResult> {
  const nombre = input.nombre?.trim();
  if (!nombre) throw new OutreachError("Nombre del contacto requerido.");

  if (!isMistralConfigured()) {
    return channel === "email" ? ruleBasedEmail(input) : ruleBasedCall(input);
  }

  const model = getMistralModel();
  if (channel === "email") {
    const content = await callMistral(
      buildEmailPrompt(input),
      "Escribes cold emails B2B concisos, personalizados y orientados a respuesta."
    );
    return { channel: "email", ...parseEmailJson(content), source: "mistral", model };
  }

  const content = await callMistral(
    buildCallPrompt(input),
    "Escribes guiones de llamada en frío B2B concisos, personalizados y orientados a agendar."
  );
  return { channel: "call", ...parseCallJson(content), source: "mistral", model };
}
