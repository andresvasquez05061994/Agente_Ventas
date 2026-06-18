import { getMistralModel, isMistralConfigured } from "./smart-search";

export type ColdCallInput = {
  nombre: string;
  cargo?: string | null;
  empresa?: string | null;
  pais?: string | null;
  notas?: string | null;
  fuente?: string | null;
};

export type ColdCallResult = {
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

export class ColdCallError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "ColdCallError";
  }
}

const IAC_CONTEXT = `IAC SAS es una empresa B2B en Colombia/LATAM que ayuda a organizaciones con:
- Automatización de procesos operativos y comerciales
- Entrenamiento y adopción de soluciones de inteligencia artificial
- Predicción de demanda y analítica para mejorar decisiones comerciales y de inventario`;

function buildPrompt(input: ColdCallInput): string {
  return `Eres un experto en ventas B2B y llamadas en frío para IAC SAS.

${IAC_CONTEXT}

Genera un guion breve y persuasivo para una PRIMERA llamada en frío al siguiente contacto:
- Nombre: ${input.nombre}
- Cargo: ${input.cargo || "No especificado"}
- Empresa: ${input.empresa || "No especificada"}
- País: ${input.pais || "Colombia/LATAM"}
${input.notas ? `- Notas internas: ${input.notas}` : ""}
${input.fuente ? `- Contexto de prospección: ${input.fuente}` : ""}

Responde SOLO JSON válido (sin markdown) con esta forma:
{
  "headline": "título corto del enfoque comercial (máx 12 palabras)",
  "opening_line": "primera frase para abrir la llamada, personalizada con nombre y empresa (2-3 oraciones)",
  "why_now": "por qué este cargo/empresa debería escuchar ahora (1-2 oraciones)",
  "value_points": ["beneficio 1 concreto para su rol", "beneficio 2", "beneficio 3"],
  "discovery_question": "pregunta abierta para calificar interés",
  "closing": "cierre suave para agendar siguiente paso (1-2 oraciones)",
  "objection_tip": "cómo responder si dice 'no tengo tiempo' o 'ya tenemos proveedor'"
}

Reglas:
- Español profesional, cercano, sin exagerar ni prometer resultados irreales.
- Conecta el mensaje con automatización, IA o predicción de demanda según el cargo.
- No inventes datos financieros ni casos de éxito nombrados.
- Máximo 120 palabras en total en opening_line + closing combinados.`;
}

function ruleBasedColdCall(input: ColdCallInput): ColdCallResult {
  const firstName = input.nombre.split(/\s+/)[0] || input.nombre;
  const company = input.empresa?.trim() || "su empresa";
  const role = input.cargo?.trim() || "su área";

  return {
    headline: `Automatización e IA para ${company}`,
    opening_line: `Hola ${firstName}, soy de IAC SAS. Vi su rol como ${role} en ${company} y quise compartirle una idea breve: ayudamos a equipos como el suyo a automatizar procesos clave y usar IA para anticipar la demanda sin proyectos eternos.`,
    why_now: `Perfiles como el suyo suelen buscar reducir trabajo manual y tomar decisiones con datos más claros en el corto plazo.`,
    value_points: [
      "Automatizar tareas repetitivas que hoy consumen tiempo del equipo",
      "Capacitar al equipo en IA aplicada a su operación real",
      "Mejorar proyecciones de demanda para compras, inventario o ventas",
    ],
    discovery_question: `¿Qué proceso manual o decisión basada en intuición les está costando más hoy en ${company}?`,
    closing: `Si le parece, puedo enviarle un ejemplo de 15 minutos la próxima semana para ver si tiene sentido para ustedes. ¿Le funciona martes o jueves por la mañana?`,
    objection_tip: `Si no tiene tiempo: "Entiendo, solo son 2 minutos para ver si vale una conversación de 15 minutos más adelante." Si ya tienen proveedor: "Perfecto, muchos clientes nos usan para complementar lo que ya tienen en automatización o analítica."`,
    source: "rules",
  };
}

async function callMistralColdCall(prompt: string): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  if (!apiKey) throw new ColdCallError("MISTRAL_API_KEY no configurada.");

  const model = getMistralModel();
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Eres un asesor comercial B2B de IAC SAS. Respondes únicamente JSON válido en español.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) {
      throw new ColdCallError("API key de Mistral inválida.", 401);
    }
    if (res.status === 429) {
      throw new ColdCallError("Límite de Mistral alcanzado. Intenta en unos segundos.", 429);
    }
    throw new ColdCallError(`Mistral respondió ${res.status}: ${text.slice(0, 180)}`, res.status);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new ColdCallError("Mistral no devolvió contenido.");
  return content;
}

function parseColdCallJson(raw: string): Omit<ColdCallResult, "source" | "model"> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new ColdCallError("Respuesta de IA no válida.");
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  }

  const valuePoints = Array.isArray(parsed.value_points)
    ? parsed.value_points.map(String).filter(Boolean).slice(0, 4)
    : [];

  return {
    headline: String(parsed.headline ?? "Guion de llamada en frío").trim(),
    opening_line: String(parsed.opening_line ?? "").trim(),
    why_now: String(parsed.why_now ?? "").trim(),
    value_points: valuePoints.length
      ? valuePoints
      : ["Automatización de procesos", "Adopción práctica de IA", "Predicción de demanda"],
    discovery_question: String(parsed.discovery_question ?? "").trim(),
    closing: String(parsed.closing ?? "").trim(),
    objection_tip: String(parsed.objection_tip ?? "").trim(),
  };
}

export async function generateColdCallMessage(input: ColdCallInput): Promise<ColdCallResult> {
  const nombre = input.nombre?.trim();
  if (!nombre) throw new ColdCallError("Nombre del contacto requerido.");

  if (!isMistralConfigured()) {
    return ruleBasedColdCall(input);
  }

  const model = getMistralModel();
  const content = await callMistralColdCall(buildPrompt(input));
  const parsed = parseColdCallJson(content);

  return {
    ...parsed,
    source: "mistral",
    model,
  };
}
