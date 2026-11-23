import { getSql } from "./db";
import type { SellerSolution } from "./seller-solutions";
import {
  DECLARED_COMPANY_SOURCES,
  type DeclaredCompanySource,
} from "./company-source-types";
import type { OfficialCompanyLookup } from "./official-company-lookup";

export { DECLARED_COMPANY_SOURCES, type DeclaredCompanySource } from "./company-source-types";

export const MAX_COMPANY_SOURCE_BYTES = 4 * 1024 * 1024;
export const MAX_COMPANY_SOURCE_ROWS = 5_000;

export type ImportedCompanyRecord = {
  legal_name: string;
  nit: string | null;
  economic_activity: string | null;
  ciiu: string | null;
  employee_count: number | null;
  city: string | null;
  department: string | null;
  raw_data: Record<string, string>;
};

export type OfficialCompanySource = {
  id: number;
  filename: string;
  declared_source: DeclaredCompanySource | string;
  row_count: number;
  created_at: string;
  updated_at: string;
};

export type OfficialCompanyVerification = {
  id: number;
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
  checked_at: string;
  updated_at: string;
};

export type OfficialCompanyMatch = {
  id: string;
  source_id: number | null;
  source_kind: "imported" | "verified";
  source_label: string;
  legal_name: string;
  nit: string | null;
  economic_activity: string | null;
  ciiu: string | null;
  employee_count: number;
  size: "Mediana" | "Grande";
  city: string | null;
  department: string | null;
  score: number;
  reasons: string[];
};

function normalize(value: unknown): string {
  return String(value ?? "")
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clean(value: unknown, max = 300): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function numberFrom(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  const raw = clean(value, 80);
  if (!raw) return null;
  const range = raw.match(/(\d[\d.,]*)\s*(?:-|–|a)\s*\d[\d.,]*/i);
  const digits = (range?.[1] ?? raw).replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
}

function keysOf(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(row)) {
    const normalized = normalize(key);
    if (normalized && !out[normalized]) out[normalized] = key;
  }
  return out;
}

function firstValue(row: Record<string, unknown>, aliases: string[]): unknown {
  const keys = keysOf(row);
  for (const alias of aliases) {
    const needle = normalize(alias);
    const exact = keys[needle];
    if (exact) return row[exact];
  }
  for (const alias of aliases) {
    const needle = normalize(alias);
    const included = Object.entries(keys).find(([key]) => key.includes(needle) || needle.includes(key));
    if (included) return row[included[1]];
  }
  return "";
}

const COMPANY_HEADERS = [
  "razon social",
  "razón social",
  "nombre empresa",
  "nombre de la empresa",
  "empresa",
  "company",
  "legal name",
] as const;
const NIT_HEADERS = ["nit", "numero nit", "número nit", "identificacion", "identificación", "tax id"] as const;
const ACTIVITY_HEADERS = [
  "actividad economica",
  "actividad económica",
  "actividad principal",
  "descripcion actividad",
  "sector",
  "actividad",
] as const;
const CIIU_HEADERS = ["ciiu", "codigo ciiu", "código ciiu"] as const;
const EMPLOYEE_HEADERS = [
  "numero empleados",
  "número empleados",
  "numero de empleados",
  "número de empleados",
  "empleados",
  "personal",
  "workers",
  "employee count",
] as const;
const CITY_HEADERS = ["municipio", "ciudad", "city"] as const;
const DEPARTMENT_HEADERS = ["departamento", "department", "region", "región"] as const;

function toRecord(row: Record<string, unknown>): ImportedCompanyRecord | null {
  const legalName = clean(firstValue(row, [...COMPANY_HEADERS]), 220);
  if (!legalName) return null;
  const rawData = Object.fromEntries(
    Object.entries(row)
      .map(([key, value]) => [clean(key, 100), clean(value, 500)])
      .filter(([key, value]) => key && value)
      .slice(0, 80)
  );
  return {
    legal_name: legalName,
    nit: clean(firstValue(row, [...NIT_HEADERS]), 60) || null,
    economic_activity: clean(firstValue(row, [...ACTIVITY_HEADERS]), 400) || null,
    ciiu: clean(firstValue(row, [...CIIU_HEADERS]), 50) || null,
    employee_count: numberFrom(firstValue(row, [...EMPLOYEE_HEADERS])),
    city: clean(firstValue(row, [...CITY_HEADERS]), 100) || null,
    department: clean(firstValue(row, [...DEPARTMENT_HEADERS]), 100) || null,
    raw_data: rawData,
  };
}

export function normalizeDeclaredSource(value: unknown): DeclaredCompanySource {
  const text = clean(value, 80);
  return (DECLARED_COMPANY_SOURCES as readonly string[]).includes(text)
    ? (text as DeclaredCompanySource)
    : "Archivo oficial";
}

export async function parseCompanySourceFile(
  filename: string,
  bytes: Uint8Array
): Promise<ImportedCompanyRecord[]> {
  if (!/\.(xlsx|xls|csv)$/i.test(filename)) {
    throw new Error("Usa un archivo Excel (.xlsx, .xls) o CSV de empresas.");
  }
  if (bytes.byteLength > MAX_COMPANY_SOURCE_BYTES) {
    throw new Error("El archivo supera 4 MB.");
  }
  const XLSX = await import("xlsx");
  const workbook = /\.csv$/i.test(filename)
    ? XLSX.read(new TextDecoder("utf-8").decode(bytes), { type: "string" })
    : XLSX.read(bytes, { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  const sheet = firstSheet ? workbook.Sheets[firstSheet] : null;
  if (!sheet) throw new Error("El archivo no contiene una hoja legible.");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
    blankrows: false,
  });
  if (!rows.length) throw new Error("El archivo no contiene filas de empresas.");
  if (rows.length > MAX_COMPANY_SOURCE_ROWS) {
    throw new Error(`Máximo ${MAX_COMPANY_SOURCE_ROWS.toLocaleString("es-CO")} filas por archivo.`);
  }
  const records = rows.map(toRecord).filter((record): record is ImportedCompanyRecord => Boolean(record));
  if (!records.length) {
    throw new Error("No encontré una columna de empresa o razón social en el archivo.");
  }
  return records;
}

function asDate(value: unknown): string {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function mapSource(row: Record<string, unknown>): OfficialCompanySource {
  return {
    id: Number(row.id),
    filename: String(row.filename ?? ""),
    declared_source: String(row.declared_source ?? "Archivo oficial"),
    row_count: Number(row.row_count ?? 0),
    created_at: asDate(row.created_at),
    updated_at: asDate(row.updated_at),
  };
}

function objectOf(value: unknown): Record<string, string> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [clean(key, 100), clean(item, 600)])
        .filter(([key, item]) => Boolean(key) && Boolean(item))
    );
  }
  if (typeof value === "string") {
    try {
      return objectOf(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return {};
}

function nullableText(value: unknown, max = 500): string | null {
  return clean(value, max) || null;
}

function nullableInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

function nitKey(value: unknown): string | null {
  const nit = clean(value, 80).split("-", 1)[0].replace(/\D/g, "");
  return nit.length >= 7 && nit.length <= 10 ? nit : null;
}

function mapVerification(row: Record<string, unknown>): OfficialCompanyVerification {
  return {
    id: Number(row.id),
    nit: String(row.nit ?? ""),
    source_key: String(row.source_key ?? ""),
    source_label: String(row.source_label ?? "Datos oficiales"),
    source_url: String(row.source_url ?? ""),
    dataset_id: String(row.dataset_id ?? ""),
    legal_name: String(row.legal_name ?? ""),
    economic_activity: nullableText(row.economic_activity, 400),
    ciiu: nullableText(row.ciiu, 50),
    macrosector: nullableText(row.macrosector, 160),
    employee_count: nullableInteger(row.employee_count),
    city: nullableText(row.city, 100),
    department: nullableText(row.department, 100),
    reporting_period: nullableText(row.reporting_period, 60),
    financial_data: objectOf(row.financial_data),
    raw_data: objectOf(row.raw_data),
    checked_at: asDate(row.checked_at),
    updated_at: asDate(row.updated_at),
  };
}

export async function saveCompanySource(input: {
  ownerId: number;
  filename: string;
  declaredSource: DeclaredCompanySource;
  records: ImportedCompanyRecord[];
}): Promise<OfficialCompanySource> {
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO official_company_sources (owner_id, filename, declared_source, row_count, created_at, updated_at)
    VALUES (${input.ownerId}, ${input.filename.slice(0, 180)}, ${input.declaredSource}, ${input.records.length}, NOW(), NOW())
    RETURNING *
  `) as Record<string, unknown>[];
  const source = mapSource(rows[0]);
  const payload = input.records.map((record) => ({
    legal_name: record.legal_name,
    nit: record.nit,
    economic_activity: record.economic_activity,
    ciiu: record.ciiu,
    employee_count: record.employee_count,
    city: record.city,
    department: record.department,
    raw_data: record.raw_data,
  }));
  await sql`
    INSERT INTO official_company_records (
      source_id, owner_id, legal_name, nit, economic_activity, ciiu, employee_count,
      city, department, raw_data, created_at, updated_at
    )
    SELECT
      ${source.id}, ${input.ownerId}, imported.legal_name, imported.nit, imported.economic_activity,
      imported.ciiu, imported.employee_count, imported.city, imported.department, imported.raw_data,
      NOW(), NOW()
    FROM jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) AS imported(
      legal_name text,
      nit text,
      economic_activity text,
      ciiu text,
      employee_count integer,
      city text,
      department text,
      raw_data jsonb
    )
  `;
  return source;
}

export async function listCompanySources(ownerId: number): Promise<OfficialCompanySource[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM official_company_sources
    WHERE owner_id = ${ownerId}
    ORDER BY created_at DESC, id DESC
  `) as Record<string, unknown>[];
  return rows.map(mapSource);
}

export async function deleteCompanySource(ownerId: number, id: number): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM official_company_sources
    WHERE owner_id = ${ownerId} AND id = ${id}
    RETURNING id
  `) as Array<{ id: number }>;
  return Boolean(rows[0]);
}

export async function saveCompanyVerification(
  ownerId: number,
  record: OfficialCompanyLookup
): Promise<OfficialCompanyVerification> {
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO official_company_verifications (
      owner_id, nit, source_key, source_label, source_url, dataset_id, legal_name,
      economic_activity, ciiu, macrosector, employee_count, city, department,
      reporting_period, financial_data, raw_data, checked_at, updated_at
    ) VALUES (
      ${ownerId}, ${record.nit}, ${record.source_key}, ${record.source_label},
      ${record.source_url}, ${record.dataset_id}, ${record.legal_name},
      ${record.economic_activity}, ${record.ciiu}, ${record.macrosector},
      ${record.employee_count}, ${record.city}, ${record.department},
      ${record.reporting_period}, ${JSON.stringify(record.financial_data)}::jsonb,
      ${JSON.stringify(record.raw_data)}::jsonb, NOW(), NOW()
    )
    ON CONFLICT (owner_id, nit, source_key) DO UPDATE
    SET
      source_label = EXCLUDED.source_label,
      source_url = EXCLUDED.source_url,
      dataset_id = EXCLUDED.dataset_id,
      legal_name = EXCLUDED.legal_name,
      economic_activity = EXCLUDED.economic_activity,
      ciiu = EXCLUDED.ciiu,
      macrosector = EXCLUDED.macrosector,
      employee_count = EXCLUDED.employee_count,
      city = EXCLUDED.city,
      department = EXCLUDED.department,
      reporting_period = EXCLUDED.reporting_period,
      financial_data = EXCLUDED.financial_data,
      raw_data = EXCLUDED.raw_data,
      checked_at = NOW(),
      updated_at = NOW()
    RETURNING *
  `) as Record<string, unknown>[];
  return mapVerification(rows[0]);
}

export async function listCompanyVerifications(ownerId: number): Promise<OfficialCompanyVerification[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM official_company_verifications
    WHERE owner_id = ${ownerId}
    ORDER BY checked_at DESC, id DESC
    LIMIT 100
  `) as Record<string, unknown>[];
  return rows.map(mapVerification);
}

function words(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((word) => word.length >= 3)
    .filter((word, index, all) => all.indexOf(word) === index)
    .slice(0, 18);
}

function scoreCompany(
  record: {
    economic_activity: string | null;
    ciiu: string | null;
    legal_name: string;
  },
  solutions: SellerSolution[]
): { score: number; reasons: string[] } {
  const haystack = normalize(`${record.economic_activity ?? ""} ${record.ciiu ?? ""} ${record.legal_name}`);
  const reasons = new Set<string>();
  let score = 0;

  for (const solution of solutions) {
    const signals = [
      ...solution.industries.flatMap(words),
      ...solution.fit_roles.flatMap(words).filter((word) => word.length >= 5),
      ...words(solution.summary).filter((word) => word.length >= 6).slice(0, 5),
    ];
    let matched = 0;
    for (const signal of new Set(signals)) {
      if (!haystack.includes(signal)) continue;
      score += solution.industries.some((industry) => words(industry).includes(signal)) ? 7 : 2;
      matched += 1;
    }
    if (matched) reasons.add(`${solution.name}: ${matched} señal${matched === 1 ? "" : "es"} en actividad`);
  }
  if (!solutions.some((solution) => solution.industries.length || solution.summary.trim())) {
    return { score: 1, reasons: ["La solución no tiene sectores ni resumen para un match automático."] };
  }
  return { score, reasons: [...reasons] };
}

export async function findOfficialCompanyMatches(
  ownerId: number,
  solutions: SellerSolution[],
  limit = 100
): Promise<OfficialCompanyMatch[]> {
  if (!solutions.length) return [];
  const sql = getSql();
  const [importedRows, verifiedRows] = await Promise.all([
    sql`
      SELECT records.id, records.source_id, sources.declared_source, sources.filename,
             records.legal_name, records.nit, records.economic_activity, records.ciiu,
             records.employee_count, records.city, records.department
      FROM official_company_records AS records
      JOIN official_company_sources AS sources ON sources.id = records.source_id
      WHERE records.owner_id = ${ownerId}
        AND records.employee_count >= 50
      ORDER BY records.employee_count DESC NULLS LAST, records.legal_name ASC
      LIMIT 5000
    `,
    sql`
      SELECT id, source_label, legal_name, nit, economic_activity, ciiu,
             employee_count, city, department
      FROM official_company_verifications
      WHERE owner_id = ${ownerId}
        AND employee_count >= 50
      ORDER BY employee_count DESC NULLS LAST, legal_name ASC
      LIMIT 1000
    `,
  ]) as [Array<Record<string, unknown>>, Array<Record<string, unknown>>];

  const verifiedByNit = new Map(
    verifiedRows.flatMap((row) => {
      const key = nitKey(row.nit);
      if (!key) return [];
      return [[key, row] as const];
    })
  );

  const imported = importedRows.flatMap((row): OfficialCompanyMatch[] => {
    const employees = Number(row.employee_count);
    if (!Number.isFinite(employees) || employees < 50) return [];
    // Se conserva el tamaño reportado por la base cargada. La validación por
    // NIT solo complementa CIIU/actividad para evaluar el ajuste de la cuenta.
    const importedNit = nitKey(row.nit);
    const verification = importedNit ? verifiedByNit.get(importedNit) : undefined;
    const economicActivity = verification?.economic_activity
      ? String(verification.economic_activity)
      : row.economic_activity
        ? String(row.economic_activity)
        : null;
    const ciiu = verification?.ciiu ? String(verification.ciiu) : row.ciiu ? String(row.ciiu) : null;
    const { score, reasons } = scoreCompany(
      {
        legal_name: String(row.legal_name ?? ""),
        economic_activity: economicActivity,
        ciiu,
      },
      solutions
    );
    if (score <= 0) return [];
    const importedSource = `${String(row.declared_source ?? "Archivo cargado")} · ${String(row.filename ?? "")}`;
    return [{
      id: `archivo-${Number(row.id)}`,
      source_id: Number(row.source_id),
      source_kind: "imported",
      source_label: verification
        ? `${importedSource} · actividad verificada en ${String(verification.source_label ?? "fuente oficial")}`
        : importedSource,
      legal_name: String(row.legal_name ?? ""),
      nit: row.nit ? String(row.nit) : null,
      economic_activity: economicActivity,
      ciiu,
      employee_count: employees,
      size: employees <= 200 ? "Mediana" : "Grande",
      city: row.city ? String(row.city) : null,
      department: row.department ? String(row.department) : null,
      score,
      reasons,
    }];
  });

  const verified = verifiedRows.flatMap((row): OfficialCompanyMatch[] => {
    const employees = Number(row.employee_count);
    if (!Number.isFinite(employees) || employees < 50) return [];
    const { score, reasons } = scoreCompany(
      {
        legal_name: String(row.legal_name ?? ""),
        economic_activity: row.economic_activity ? String(row.economic_activity) : null,
        ciiu: row.ciiu ? String(row.ciiu) : null,
      },
      solutions
    );
    if (score <= 0) return [];
    return [{
      id: `consulta-${Number(row.id)}`,
      source_id: null,
      source_kind: "verified",
      source_label: String(row.source_label ?? "Consulta oficial"),
      legal_name: String(row.legal_name ?? ""),
      nit: row.nit ? String(row.nit) : null,
      economic_activity: row.economic_activity ? String(row.economic_activity) : null,
      ciiu: row.ciiu ? String(row.ciiu) : null,
      employee_count: employees,
      size: employees <= 200 ? "Mediana" : "Grande",
      city: row.city ? String(row.city) : null,
      department: row.department ? String(row.department) : null,
      score,
      reasons,
    }];
  });

  return [...imported, ...verified]
    .sort((left, right) => right.score - left.score || right.employee_count - left.employee_count)
    .slice(0, Math.max(1, Math.min(200, limit)));
}
