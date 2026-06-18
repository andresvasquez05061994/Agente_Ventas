import type { Lead } from "./types";

const CSV_COLUMNS: (keyof Lead)[] = [
  "id",
  "apollo_id",
  "nombre",
  "cargo",
  "empresa",
  "email",
  "telefono",
  "pais",
  "linkedin_url",
  "lead_status",
  "notas",
  "fuente_busqueda",
  "created_at",
];

function escapeCsv(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function leadsToCsv(leads: Lead[]): string {
  const header = CSV_COLUMNS.join(",");
  const rows = leads.map((lead) =>
    CSV_COLUMNS.map((col) => escapeCsv(lead[col])).join(",")
  );
  return `\uFEFF${[header, ...rows].join("\r\n")}`;
}

export function downloadLeadsCsv(leads: Lead[], filename?: string) {
  const blob = new Blob([leadsToCsv(leads)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `portafolio_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
