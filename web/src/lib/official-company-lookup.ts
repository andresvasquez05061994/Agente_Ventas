const DATOS_GOV_API = "https://www.datos.gov.co/api/v3/views";
const DATOS_GOV_TOKEN_ENV = "DATOS_GOV_APP_TOKEN";
const LOOKUP_TIMEOUT_MS = 12_000;

export const SUPERSOCIEDADES_LARGE_COMPANIES_SOURCE = {
  key: "datos-gov-6cat-2gcs",
  datasetId: "6cat-2gcs",
  label: "Datos Abiertos Colombia · Empresas grandes",
  datasetUrl: "https://www.datos.gov.co/Comercio-Industria-y-Turismo/10-000-Empresas-mas-Grandes-del-Pa-s/6cat-2gcs",
  /**
   * Este conjunto sirve para identidad, actividad y datos financieros. No
   * publica trabajadores, por lo que nunca se infiere el tamaño por empleados.
   */
  hasEmployeeCount: false,
} as const;

export type OfficialCompanyLookup = {
  nit: string;
  source_key: string;
  source_label: string;
  source_url: string;
  dataset_id: string;
  legal_name: string;
  economic_activity: string | null;
  ciiu: string | null;
  macrosector: string | null;
  employee_count: number | null;
  city: string | null;
  department: string | null;
  reporting_period: string | null;
  financial_data: Record<string, string>;
  raw_data: Record<string, string>;
};

export class OfficialCompanyLookupError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "OfficialCompanyLookupError";
    this.status = status;
  }
}

function clean(value: unknown, max = 500): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

/** El NIT debe llegar sin separadores ni dígito de verificación. */
export function normalizeLookupNit(value: unknown): string {
  const raw = String(value ?? "").trim();
  // Cuando el usuario pega 900.123.456-7, se conserva el NIT y se descarta
  // explícitamente el dígito de verificación después del guion.
  const nit = raw.split("-", 1)[0].replace(/\D/g, "");
  if (nit.length < 7 || nit.length > 10) {
    throw new OfficialCompanyLookupError("Escribe un NIT válido, sin puntos ni dígito de verificación.", 400);
  }
  return nit;
}

export function isDatosGovConfigured(): boolean {
  return Boolean(process.env[DATOS_GOV_TOKEN_ENV]?.trim());
}

export function buildSupersociedadesQuery(nit: string): string {
  const normalizedNit = normalizeLookupNit(nit);
  return [
    "SELECT `nit`, `raz_n_social`, `ciiu`, `macrosector`, `supervisor`,",
    "`departamento_domicilio`, `ciudad_domicilio`, `ingresos_operacionales`,",
    "`ganancia_p_rdida`, `total_activos`, `total_pasivos`, `total_patrimonio`, `a_o_de_corte`",
    `WHERE \`nit\` = ${normalizedNit}`,
    "ORDER BY `a_o_de_corte` DESC",
    "LIMIT 1",
  ].join(" ");
}

function recordFromPayload(payload: unknown): Record<string, unknown> | null {
  const asRows = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value)
      ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
      : [];

  const direct = asRows(payload);
  if (direct.length) return direct[0];
  if (!payload || typeof payload !== "object") return null;

  const source = payload as Record<string, unknown>;
  for (const key of ["data", "results", "rows"]) {
    const rows = asRows(source[key]);
    if (rows.length) return rows[0];
  }
  return null;
}

function rawRecord(row: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(row)
      .map(([key, value]) => [clean(key, 100), clean(value, 600)])
      .filter(([key, value]) => Boolean(key) && Boolean(value))
      .slice(0, 80)
  );
}

function mapSupersociedadesRow(nit: string, row: Record<string, unknown>): OfficialCompanyLookup {
  const raw = rawRecord(row);
  const macrosector = clean(row.macrosector, 160) || null;
  const ciiu = clean(row.ciiu, 40) || null;
  const financialData = {
    ingresos_operacionales: clean(row.ingresos_operacionales, 120),
    ganancia_perdida: clean(row.ganancia_p_rdida, 120),
    total_activos: clean(row.total_activos, 120),
    total_pasivos: clean(row.total_pasivos, 120),
    total_patrimonio: clean(row.total_patrimonio, 120),
  };

  return {
    nit,
    source_key: SUPERSOCIEDADES_LARGE_COMPANIES_SOURCE.key,
    source_label: SUPERSOCIEDADES_LARGE_COMPANIES_SOURCE.label,
    source_url: SUPERSOCIEDADES_LARGE_COMPANIES_SOURCE.datasetUrl,
    dataset_id: SUPERSOCIEDADES_LARGE_COMPANIES_SOURCE.datasetId,
    legal_name: clean(row.raz_n_social, 220),
    economic_activity: macrosector ? `Macrosector: ${macrosector}` : null,
    ciiu,
    macrosector,
    employee_count: null,
    city: clean(row.ciudad_domicilio, 100) || null,
    department: clean(row.departamento_domicilio, 100) || null,
    reporting_period: clean(row.a_o_de_corte, 40) || null,
    financial_data: Object.fromEntries(Object.entries(financialData).filter(([, value]) => Boolean(value))),
    raw_data: raw,
  };
}

/**
 * Consulta una única cuenta por NIT. El token nunca sale del Route Handler.
 * El resultado es un dato fuente, no un criterio suficiente de tamaño:
 * este conjunto no publica el número de trabajadores.
 */
export async function lookupSupersociedadesCompany(nit: unknown): Promise<OfficialCompanyLookup | null> {
  const normalizedNit = normalizeLookupNit(nit);
  const token = process.env[DATOS_GOV_TOKEN_ENV]?.trim();
  if (!token) {
    throw new OfficialCompanyLookupError(
      "La consulta oficial no está configurada. Agrega DATOS_GOV_APP_TOKEN como secreto del servidor.",
      503
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${DATOS_GOV_API}/${SUPERSOCIEDADES_LARGE_COMPANIES_SOURCE.datasetId}/query.json`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-App-Token": token,
        },
        body: JSON.stringify({
          query: buildSupersociedadesQuery(normalizedNit),
          page: { pageNumber: 1, pageSize: 1 },
          includeSynthetic: false,
        }),
        cache: "no-store",
        signal: controller.signal,
      }
    );

    if (response.status === 404) return null;
    if (response.status === 401 || response.status === 403) {
      throw new OfficialCompanyLookupError("Datos Abiertos rechazó la credencial configurada.", 502);
    }
    if (response.status === 429) {
      throw new OfficialCompanyLookupError("Datos Abiertos alcanzó su límite temporal. Intenta de nuevo más tarde.", 429);
    }
    if (!response.ok) {
      throw new OfficialCompanyLookupError(`Datos Abiertos no respondió la consulta (${response.status}).`);
    }

    const row = recordFromPayload(await response.json());
    if (!row) return null;
    const record = mapSupersociedadesRow(normalizedNit, row);
    return record.legal_name ? record : null;
  } catch (error) {
    if (error instanceof OfficialCompanyLookupError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new OfficialCompanyLookupError("La consulta oficial excedió el tiempo de espera.", 504);
    }
    throw new OfficialCompanyLookupError("No se pudo conectar con Datos Abiertos Colombia.");
  } finally {
    clearTimeout(timer);
  }
}
