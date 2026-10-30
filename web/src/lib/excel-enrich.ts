import { cleanCompanyName, sanitizeSpreadsheetText } from "./excel-companies";
import { cleanPersonName } from "./excel-attendees";
import { APOLLO_COUNTRIES, APOLLO_KEYWORDS, inferEmployeeRangesFromText } from "./apollo-filters";
import type { ApolloPerson } from "./types";

export const MAX_ENRICH_BATCH = 100;
export const MAX_ENRICH_ROWS = 8000;
export const ENRICH_PAGE_SIZE = 25;

export type EnrichFieldId =
  | "nombre"
  | "empresa"
  | "cargo"
  | "telefono"
  | "email"
  | "linkedin"
  | "pais"
  | "industria"
  | "tamano_empresa";

export const SEARCH_FIELDS: { id: EnrichFieldId; label: string }[] = [
  { id: "nombre", label: "Nombre" },
  { id: "empresa", label: "Empresa" },
  { id: "cargo", label: "Cargo" },
  { id: "pais", label: "País" },
  { id: "industria", label: "Industria" },
  { id: "tamano_empresa", label: "Tamaño de empresa" },
];

export const FILL_FIELDS: { id: EnrichFieldId; label: string; required?: boolean }[] = [
  { id: "telefono", label: "Móvil", required: true },
  { id: "email", label: "Correo", required: true },
  { id: "linkedin", label: "Perfil LinkedIn" },
  { id: "pais", label: "País" },
  { id: "empresa", label: "Empresa" },
  { id: "cargo", label: "Cargo" },
  { id: "nombre", label: "Nombre" },
];

export const FILL_COLUMN_LABEL: Record<EnrichFieldId, string> = {
  nombre: "Nombre",
  empresa: "Empresa",
  cargo: "Cargo",
  telefono: "Móvil",
  email: "Correo",
  linkedin: "LinkedIn",
  pais: "País",
  industria: "Industria",
  tamano_empresa: "Tamaño de empresa",
};

const FIELD_TESTS: { id: EnrichFieldId; test: RegExp }[] = [
  { id: "linkedin", test: /linkedin/ },
  { id: "telefono", test: /^(movil|celular|telefono|phone|mobile|cel|whatsapp)$/ },
  { id: "email", test: /^(correo|email|e mail|mail)$/ },
  { id: "cargo", test: /^(cargo|puesto|titulo|rol|role|posicion|job title|title)$/ },
  { id: "pais", test: /^(pais|country)$/ },
  { id: "industria", test: /^(industria|sector|industry|vertical)$/ },
  { id: "tamano_empresa", test: /^(tamano|tamaño|tamano empresa|tamaño empresa|tamano de empresa|tamaño de empresa|empleados|numero empleados|numero de empleados|company size|employee count)$/ },
  { id: "empresa", test: /^(empresa|company|compania|organizacion|organization|razon social|nombre de la empresa|nombre empresa|nombre de empresa)$/ },
  { id: "nombre", test: /^(nombre|nombre completo|nombre del contacto|nombre contacto|contacto|persona|asistente|participante|attendee|full name|name)$/ },
];

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const ENRICH_COUNTRY_ALIASES: Record<string, string> = {
  colombia: "Colombia",
  mexico: "Mexico",
  brasil: "Brazil",
  brazil: "Brazil",
  argentina: "Argentina",
  chile: "Chile",
  peru: "Peru",
  ecuador: "Ecuador",
  panama: "Panama",
  "estados unidos": "United States",
  "united states": "United States",
  usa: "United States",
  eeuu: "United States",
  espana: "Spain",
  spain: "Spain",
};

/** Convierte el país escrito en la hoja a uno de los valores admitidos por Apollo. */
export function resolveEnrichCountry(value: string): string | null {
  const normalized = fold(value);
  if (!normalized) return null;
  return (
    APOLLO_COUNTRIES.find((country) => fold(country.value) === normalized || fold(country.label) === normalized)?.value ??
    ENRICH_COUNTRY_ALIASES[normalized] ??
    null
  );
}

export function cellText(value: unknown): string {
  return sanitizeSpreadsheetText(value);
}

export function detectEnrichField(header: string): EnrichFieldId | null {
  const folded = fold(header);
  if (!folded || folded.length > 80) return null;
  return FIELD_TESTS.find((rule) => rule.test.test(folded))?.id ?? null;
}

export type EnrichColumn = {
  index: number;
  header: string;
  field: EnrichFieldId | null;
};

export type EnrichSheet = {
  fileLabel: string;
  headers: string[];
  columns: EnrichColumn[];
  rows: string[][];
};

export function parseEnrichMatrix(matrix: unknown[][]): Omit<EnrichSheet, "fileLabel"> {
  const rows = matrix
    .map((row) => (Array.isArray(row) ? row.map(cellText) : []))
    .filter((row) => row.some((cell) => cell.length > 0));
  if (!rows.length) {
    throw new Error("El archivo no tiene filas con dato.");
  }

  let headerIndex = 0;
  const scan = Math.min(rows.length, 8);
  let bestScore = -1;
  for (let i = 0; i < scan; i++) {
    const score = rows[i].reduce((sum, cell) => sum + (detectEnrichField(cell) ? 2 : cell ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      headerIndex = i;
    }
  }

  const header = rows[headerIndex];
  const columns: EnrichColumn[] = header.map((headerLabel, index) => ({
    index,
    header: headerLabel || `Columna ${index + 1}`,
    field: detectEnrichField(headerLabel),
  }));

  const used = new Set<EnrichFieldId>();
  for (const column of columns) {
    if (column.field && used.has(column.field)) column.field = null;
    else if (column.field) used.add(column.field);
  }

  const data = rows.slice(headerIndex + 1).map((row) => {
    const next = columns.map((_, index) => row[index] ?? "");
    return next;
  });

  if (data.length > MAX_ENRICH_ROWS) {
    throw new Error(`El archivo trae más de ${MAX_ENRICH_ROWS} filas. Divídelo y vuelve a subirlo.`);
  }
  if (!data.length) {
    throw new Error("No hay filas debajo del encabezado.");
  }

  return {
    headers: columns.map((column) => column.header),
    columns,
    rows: data,
  };
}

export function suggestedSearchBy(columns: EnrichColumn[]): EnrichFieldId[] {
  const present = new Set(columns.map((column) => column.field).filter(Boolean) as EnrichFieldId[]);
  return SEARCH_FIELDS.map((field) => field.id).filter((id) => present.has(id));
}

export function suggestedFill(): EnrichFieldId[] {
  return FILL_FIELDS.filter((field) => field.required).map((field) => field.id);
}

export function ensureFillColumns(sheet: EnrichSheet, fill: EnrichFieldId[]): EnrichSheet {
  const headers = [...sheet.headers];
  const columns = [...sheet.columns];
  const rows = sheet.rows.map((row) => [...row]);

  for (const field of fill) {
    if (columns.some((column) => column.field === field)) continue;
    const header = FILL_COLUMN_LABEL[field];
    const index = headers.length;
    headers.push(header);
    columns.push({ index, header, field });
    for (const row of rows) row.push("");
  }

  return { ...sheet, headers, columns, rows };
}

export function valueOf(row: string[], columns: EnrichColumn[], field: EnrichFieldId): string {
  const column = columns.find((item) => item.field === field);
  if (!column) return "";
  return row[column.index] ?? "";
}

export function searchName(row: string[], columns: EnrichColumn[]): string {
  return cleanPersonName(valueOf(row, columns, "nombre"));
}

export function searchCompany(row: string[], columns: EnrichColumn[]): string {
  return cleanCompanyName(valueOf(row, columns, "empresa"));
}

export function searchTitle(row: string[], columns: EnrichColumn[]): string {
  return cellText(valueOf(row, columns, "cargo")).replace(/[.…]+$/g, "").slice(0, 80);
}

export function searchCountry(row: string[], columns: EnrichColumn[]): string {
  return cellText(valueOf(row, columns, "pais"));
}

export function searchIndustry(row: string[], columns: EnrichColumn[]): string {
  return cellText(valueOf(row, columns, "industria"));
}

export function searchEmployeeRanges(row: string[], columns: EnrichColumn[]): string[] {
  return inferEmployeeRangesFromText(cellText(valueOf(row, columns, "tamano_empresa")));
}

/** Solo enviamos industrias que coinciden con una categoría de Apollo. Una industria libre se conserva, pero no se inventa un filtro. */
export function resolveEnrichIndustry(value: string): string {
  const normalized = fold(value);
  if (!normalized) return "";
  return APOLLO_KEYWORDS.find(
    (industry) => fold(industry.value) === normalized || fold(industry.label) === normalized
  )?.value ?? "";
}

export function personFieldValue(person: ApolloPerson, field: EnrichFieldId): string {
  switch (field) {
    case "nombre":
      return cellText(person.nombre);
    case "empresa":
      return cellText(person.empresa);
    case "cargo":
      return cellText(person.cargo);
    case "telefono":
      return cellText(person.telefono);
    case "email":
      return cellText(person.email);
    case "linkedin":
      return cellText(person.linkedin_url);
    case "pais":
      return cellText(person.pais);
    default:
      return "";
  }
}

/** Completa solo las celdas elegidas; no pisa un dato que el archivo ya traía. */
export function applyPersonToRow(
  row: string[],
  columns: EnrichColumn[],
  fill: EnrichFieldId[],
  person: ApolloPerson
): string[] {
  const next = [...row];
  for (const field of fill) {
    const column = columns.find((item) => item.field === field);
    if (!column) continue;
    if (cellText(next[column.index])) continue;
    const value = personFieldValue(person, field);
    if (value) next[column.index] = value;
  }
  return next;
}

export type EnrichRowStatus =
  | "pending"
  | "filled"
  | "already"
  | "portfolio"
  | "phone_only"
  | "not_found"
  | "no_contacts"
  | "invalid_country"
  | "insufficient_data"
  | "error";

/** Solo las filas nunca resueltas vuelven a entrar en una tanda. */
export function isPendingEnrichmentStatus(status: EnrichRowStatus | undefined): boolean {
  return status === "pending";
}
