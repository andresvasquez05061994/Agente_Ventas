/**
 * Conocimiento comercial IAC SAS — derivado de IAC_Portafolio_IA_v3.pdf
 * Usado por Mensaje IA para conectar oferta con el perfil del prospecto.
 */

export type IACSolution = {
  id: string;
  name: string;
  summary: string;
  metrics: string[];
  fit_roles: string[];
  industries: string[];
  talking_points: string[];
};

export type SolutionMatch = {
  solution: IACSolution;
  score: number;
  reasons: string[];
};

export const IAC_COMPANY_PROFILE = {
  name: "IAC SAS",
  tagline: "Hacemos sus procesos más rentables",
  experience: "30+ años acompañando transformación digital en LATAM",
  scale: "500+ clientes, 250+ proyectos",
  domains: ["Consultoría BIM · PLM · AI · RPA", "Entrenamiento consultivo", "Automatización"],
  sectors: [
    "Manufactura",
    "Arquitectura",
    "Construcción",
    "Inmobiliaria",
    "Retail",
    "BPO",
    "Supermercados",
    "Agroexportación",
  ],
  contact: {
    consultant: "Andrés Zapata",
    role: "Consultor IA/RPA",
    email: "andres.zapata@iaclatam.com.co",
    phone: "+57 322 859 2150",
    web: "www.iaclatam.com.co",
  },
};

export const IAC_SOLUTIONS: IACSolution[] = [
  {
    id: "automation-center",
    name: "Centro de Automatización (RPA + IA)",
    summary:
      "Suite RPA + IA para automatizar back-office y operaciones con conectores ERP, CRM y portales — operación 24/7.",
    metrics: [
      "Hasta 70% menos tiempo de operación",
      "Hasta 40% reducción de costos operativos",
      "Quick wins con payback promedio menor a 4 meses",
      "SLA, trazabilidad y gobierno centralizados",
    ],
    fit_roles: [
      "coo",
      "operaciones",
      "operations",
      "automatización",
      "automation",
      "it director",
      "cio",
      "cto",
      "director de ti",
      "general manager",
      "ceo",
      "cfo",
      "process",
      "procesos",
      "rpa",
      "erp",
    ],
    industries: [
      "manufactura",
      "bpo",
      "retail",
      "construcción",
      "logística",
      "agricultura",
      "agroexportación",
      "floricultura",
      "exportación",
    ],
    talking_points: [
      "Eliminar trabajo manual repetitivo en ERP/CRM",
      "Integración y extensión de ERP existente sin reemplazarlo",
      "Operación 24/7 con menos errores humanos",
    ],
  },
  {
    id: "demand-forecast",
    name: "Predicción de Demanda",
    summary:
      "Pronóstico de inventarios con analítica de clientes, segmentación y fidelización — integración simple con ERP.",
    metrics: [
      "Hasta 95% precisión en planeación",
      "Hasta 87% menos tiempo en planeación de SKUs",
      "92% de productos con mejor margen en predicción",
      "Reduce quiebres de stock y sobre-inventario",
    ],
    fit_roles: [
      "supply chain",
      "cadena",
      "demand",
      "demanda",
      "inventario",
      "inventory",
      "compras",
      "procurement",
      "planificación",
      "planning",
      "analytics",
      "data",
      "cdo",
      "bi",
    ],
    industries: ["retail", "supermercados", "manufactura", "distribución"],
    talking_points: [
      "Simular temporadas, picos y eventos comerciales",
      "Mejorar rotación, margen y flujo de caja",
      "Decisiones de compra con datos, no solo intuición",
    ],
  },
  {
    id: "agentic-ai",
    name: "Soluciones Agénticas (IA 24/7)",
    summary:
      "Agentes de IA que operan 24/7, integran ERP/CRM y gestionan procesos de punta a punta: ventas, cobranzas, retención y servicio.",
    metrics: [
      "Hasta 3x conversión en outbound",
      "Hasta 2x conversión inbound",
      "Primera respuesta en menos de 10 segundos",
      "Más de 90% resolución autónoma en servicio",
    ],
    fit_roles: [
      "ventas",
      "sales",
      "commercial",
      "comercial",
      "marketing",
      "customer",
      "cliente",
      "cobranza",
      "collections",
      "retención",
      "crm",
      "revenue",
      "cro",
    ],
    industries: ["inmobiliaria", "retail", "bpo", "supermercados", "servicios"],
    talking_points: [
      "Prospectar, calificar y dar seguimiento automático",
      "Cobranzas y negociación con segmentación por riesgo",
      "Detección de churn y campañas de retención",
    ],
  },
  {
    id: "ai-training",
    name: "Entrenamiento Consultivo en IA",
    summary:
      "Potencia equipos con IA generativa aplicada: de asistentes básicos a agentes autónomos y automatización de procesos.",
    metrics: [
      "Programa de 24 horas de formación",
      "50+ prompts listos por caso de uso",
      "Certificado digital e insignia LinkedIn",
      "Proyecto final: agente configurado y entregado",
    ],
    fit_roles: [
      "innovación",
      "innovation",
      "hr",
      "talento",
      "people",
      "formación",
      "training",
      "learning",
      "transformación",
      "digital",
    ],
    industries: ["todos los sectores B2B"],
    talking_points: [
      "Adopción práctica de IA en el equipo, no teoría",
      "Playbooks y entregables reales por módulo",
      "Modalidad presencial, virtual o híbrida",
    ],
  },
];

/** Señales de necesidad explícitas por solución (mayor peso = mayor coincidencia). */
const NEED_SIGNALS: Record<string, Array<{ re: RegExp; weight: number; label: string }>> = {
  "automation-center": [
    { re: /\berp\b|software a medida|sistema de gesti[oó]n|desarrollo a medida/, weight: 14, label: "ERP / software a medida" },
    { re: /\brpa\b|automatiz|proceso(s)? manual|back.?office|integraci[oó]n/, weight: 11, label: "automatización de procesos" },
    { re: /flor|agro|exportaci[oó]n|agricult|horticult|manufactur|construcc|log[ií]stic/, weight: 8, label: "sector operativo" },
    { re: /cio|cto|it director|director de ti|sistemas|tecnolog[ií]a/, weight: 6, label: "liderazgo TI/operaciones" },
    { re: /general manager|gerente general|\bceo\b|coo|cfo/, weight: 5, label: "dirección general" },
  ],
  "demand-forecast": [
    { re: /predicci[oó]n de demanda|demand planning|forecast|planeaci[oó]n de invent/, weight: 14, label: "predicción de demanda" },
    { re: /inventario|quiebre de stock|sobre.?inventario|\bsku\b|rotaci[oó]n de stock/, weight: 11, label: "gestión de inventarios" },
    { re: /supply chain|cadena de suministro|compras|procurement/, weight: 7, label: "cadena de suministro" },
    { re: /retail|supermercado|distribuci[oó]n masiva/, weight: 5, label: "retail / distribución" },
  ],
  "agentic-ai": [
    { re: /outbound|inbound|prospecci[oó]n comercial|pipeline de ventas/, weight: 12, label: "ventas automatizadas" },
    { re: /cobranza|collections|recuperaci[oó]n de cartera/, weight: 10, label: "cobranzas" },
    { re: /retenci[oó]n|churn|atenci[oó]n al cliente|servicio al cliente/, weight: 9, label: "retención y servicio" },
    { re: /ventas|comercial|marketing|crm|revenue/, weight: 7, label: "área comercial" },
  ],
  "ai-training": [
    { re: /formaci[oó]n|capacitaci[oó]n|entrenamiento|upskilling|reskilling/, weight: 13, label: "formación de equipos" },
    { re: /adopci[oó]n de ia|cultura digital|alfabetizaci[oó]n/, weight: 10, label: "adopción de IA" },
    { re: /innovaci[oó]n|transformaci[oó]n digital/, weight: 6, label: "innovación / transformación" },
  ],
};

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function scoreSolution(solution: IACSolution, combined: string): SolutionMatch {
  let score = 0;
  const reasons: string[] = [];

  for (const signal of NEED_SIGNALS[solution.id] ?? []) {
    if (signal.re.test(combined)) {
      score += signal.weight;
      reasons.push(signal.label);
    }
  }

  for (const role of solution.fit_roles) {
    if (combined.includes(normalizeToken(role))) {
      score += 2;
    }
  }

  for (const industry of solution.industries) {
    if (industry === "todos los sectores B2B") continue;
    if (combined.includes(normalizeToken(industry))) {
      score += 3;
      reasons.push(`sector ${industry}`);
    }
  }

  if (solution.id === "demand-forecast") {
    const hasDemandNeed = NEED_SIGNALS["demand-forecast"].some(
      (s) => s.weight >= 7 && s.re.test(combined)
    );
    if (!hasDemandNeed) score -= 25;
  }

  return { solution, score: Math.max(0, score), reasons: [...new Set(reasons)] };
}

export function rankSolutionsForProspect(
  cargo: string | null | undefined,
  hints = ""
): SolutionMatch[] {
  const combined = normalizeToken(`${cargo ?? ""} ${hints}`);

  const ranked = IAC_SOLUTIONS.map((solution) => scoreSolution(solution, combined)).sort(
    (a, b) => b.score - a.score
  );

  if (ranked[0]?.score === 0) {
    const cargoNorm = normalizeToken(cargo ?? "");
    const fallbackId =
      /ventas|sales|comercial|marketing|crm/.test(cargoNorm)
        ? "agentic-ai"
        : /supply|inventario|compras|demand|data|analytics/.test(cargoNorm)
          ? "demand-forecast"
          : /innov|talent|hr|formaci/.test(cargoNorm)
            ? "ai-training"
            : "automation-center";

    const fallback = IAC_SOLUTIONS.find((s) => s.id === fallbackId)!;
    const rest = IAC_SOLUTIONS.filter((s) => s.id !== fallbackId);
    return [
      {
        solution: fallback,
        score: 1,
        reasons: ["coincidencia por cargo (sin señales explícitas en contexto)"],
      },
      ...rest.map((solution) => ({ solution, score: 0, reasons: [] as string[] })),
    ];
  }

  return ranked;
}

export function pickSolutionsForProspect(
  cargo: string | null | undefined,
  hints = ""
): IACSolution[] {
  return rankSolutionsForProspect(cargo, hints)
    .filter((m) => m.score > 0)
    .slice(0, 2)
    .map((m) => m.solution);
}

export function formatPortfolioForPrompt(solutions: IACSolution[]): string {
  const header = `${IAC_COMPANY_PROFILE.name} — ${IAC_COMPANY_PROFILE.tagline}
${IAC_COMPANY_PROFILE.experience}. ${IAC_COMPANY_PROFILE.scale}.
Sectores: ${IAC_COMPANY_PROFILE.sectors.join(", ")}.
Web: ${IAC_COMPANY_PROFILE.contact.web}`;

  const primary = solutions[0];
  const secondary = solutions[1];

  const blocks = solutions.map((s, index) => {
    const role =
      index === 0
        ? "SOLUCIÓN PRINCIPAL — eje obligatorio del mensaje"
        : "SOLUCIÓN COMPLEMENTARIA — mencionar solo brevemente si aporta valor";
    return `### ${s.name} (${role})
${s.summary}
Métricas de referencia (orientación, no inventar casos nombrados): ${s.metrics.join("; ")}
Ángulos de conversación: ${s.talking_points.join("; ")}`;
  });

  const guardrails = `REGLAS DE ENFOQUE:
- El mensaje debe girar en torno a «${primary?.name ?? "la solución principal"}».
- NO mencionar Predicción de Demanda salvo que sea la solución principal o complementaria listada abajo.
- No ofrecer soluciones del portafolio IAC que no aparezcan en esta lista.
${secondary ? `- Máximo una mención breve de «${secondary.name}» si refuerza el argumento.` : "- No hace falta segunda solución."}`;

  return `${header}\n\n${guardrails}\n\n${blocks.join("\n\n")}`;
}

export function formatSolutionNames(solutions: IACSolution[]): string[] {
  return solutions.map((s) => s.name);
}

export function formatMatchExplanation(matches: SolutionMatch[]): string {
  const top = matches.filter((m) => m.score > 0).slice(0, 2);
  if (!top.length) return "Sin señales fuertes; se usó coincidencia por cargo.";
  return top
    .map((m, i) => {
      const role = i === 0 ? "Principal" : "Complementaria";
      const why = m.reasons.length ? m.reasons.join(", ") : "perfil del cargo";
      return `${role}: ${m.solution.name} (${why})`;
    })
    .join(" · ");
}
