import type { EnrichColumn, EnrichFieldId, EnrichRowStatus, EnrichSheet } from "./excel-enrich";

export type EnrichmentSource = "portfolio" | "apollo" | "validation" | "error";

export type EnrichmentConfig = {
  searchBy: EnrichFieldId[];
  allCountries: boolean;
  countries: string[];
  fallbackTitles: string;
  fallbackIndustry: string;
  fallbackEmployeeRange: string;
  contactsPerRow: number;
};

export type EnrichmentOutcome = {
  sourceIndex: number;
  status: EnrichRowStatus;
  source: EnrichmentSource;
  rows: string[][];
  credits: number;
};

export type EnrichmentSession = {
  id: number;
  fingerprint: string;
  filename: string;
  headers: string[];
  columns: EnrichColumn[];
  sourceRows: number;
  config: Partial<EnrichmentConfig>;
  outcomes: EnrichmentOutcome[];
};

function paddedRow(row: string[], width: number): string[] {
  return Array.from({ length: width }, (_, index) => row[index] ?? "");
}

/** Reconstruye la hoja al volver a seleccionar el mismo archivo después de una recarga. */
export function restoreEnrichmentSession(
  input: EnrichSheet,
  session: EnrichmentSession
): { sheet: EnrichSheet; statuses: EnrichRowStatus[] } {
  const headers = session.headers.length ? session.headers : input.headers;
  const columns = session.columns.length ? session.columns : input.columns;
  const sourceRows = input.rows.map((row) => paddedRow(row, headers.length));
  const statuses: EnrichRowStatus[] = input.rows.map(() => "pending");
  const extras: string[][] = [];
  const extraStatuses: EnrichRowStatus[] = [];

  for (const outcome of session.outcomes) {
    if (outcome.sourceIndex < 0 || outcome.sourceIndex >= sourceRows.length) continue;
    statuses[outcome.sourceIndex] = outcome.status;
    const [first, ...rest] = outcome.rows;
    if (first) sourceRows[outcome.sourceIndex] = paddedRow(first, headers.length);
    for (const row of rest) {
      extras.push(paddedRow(row, headers.length));
      extraStatuses.push(outcome.status);
    }
  }

  return {
    sheet: { ...input, headers, columns, rows: [...sourceRows, ...extras] },
    statuses: [...statuses, ...extraStatuses],
  };
}
