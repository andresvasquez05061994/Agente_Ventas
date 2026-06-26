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
      "process",
      "procesos",
      "rpa",
    ],
    industries: ["manufactura", "bpo", "retail", "construcción", "logística"],
    talking_points: [
      "Eliminar trabajo manual repetitivo en ERP/CRM",
      "Operación 24/7 con menos errores humanos",
      "Integración con sistemas que ya usan",
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

const ROLE_SOLUTION_PRIORITY: Record<string, string[]> = {
  operations: ["automation-center", "demand-forecast", "agentic-ai"],
  sales: ["agentic-ai", "automation-center", "ai-training"],
  data: ["demand-forecast", "automation-center", "agentic-ai"],
  default: ["automation-center", "agentic-ai", "demand-forecast", "ai-training"],
};

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function detectRoleBucket(cargo: string | null | undefined): keyof typeof ROLE_SOLUTION_PRIORITY {
  const c = normalizeToken(cargo ?? "");
  if (
    /supply|cadena|demand|demanda|inventario|compras|planific|analytics|data|cdo|bi/.test(c)
  ) {
    return "data";
  }
  if (/ventas|sales|comercial|marketing|customer|cliente|cobranza|crm|revenue|cro/.test(c)) {
    return "sales";
  }
  if (/operac|automat|rpa|process|proceso|coo|cio|cto|ti|it/.test(c)) {
    return "operations";
  }
  return "default";
}

export function pickSolutionsForProspect(
  cargo: string | null | undefined,
  hints = ""
): IACSolution[] {
  const combined = normalizeToken(`${cargo ?? ""} ${hints}`);
  const bucket = detectRoleBucket(cargo);
  const priority = ROLE_SOLUTION_PRIORITY[bucket];

  const scored = IAC_SOLUTIONS.map((solution) => {
    let score = priority.indexOf(solution.id);
    if (score < 0) score = 10;
    for (const role of solution.fit_roles) {
      if (combined.includes(normalizeToken(role))) score -= 3;
    }
    for (const industry of solution.industries) {
      if (combined.includes(normalizeToken(industry))) score -= 2;
    }
    return { solution, score };
  });

  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
    .map((s) => s.solution);
}

export function formatPortfolioForPrompt(solutions: IACSolution[]): string {
  const header = `${IAC_COMPANY_PROFILE.name} — ${IAC_COMPANY_PROFILE.tagline}
${IAC_COMPANY_PROFILE.experience}. ${IAC_COMPANY_PROFILE.scale}.
Sectores: ${IAC_COMPANY_PROFILE.sectors.join(", ")}.
Web: ${IAC_COMPANY_PROFILE.contact.web}`;

  const blocks = solutions.map((s) => {
    return `### ${s.name}
${s.summary}
Métricas de referencia (usar solo como orientación, no inventar casos nombrados): ${s.metrics.join("; ")}
Ángulos de conversación: ${s.talking_points.join("; ")}`;
  });

  return `${header}\n\nSOLUCIONES IAC A PRIORIZAR EN ESTE MENSAJE:\n${blocks.join("\n\n")}`;
}

export function formatSolutionNames(solutions: IACSolution[]): string[] {
  return solutions.map((s) => s.name);
}
