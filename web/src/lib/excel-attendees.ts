import { cleanCompanyName, parseCompanyCell, sanitizeSpreadsheetText } from "./excel-companies";

/** Tanda por clic: cada persona puede gastar créditos de email + teléfono. */
export const MAX_ATTENDEES_PER_BATCH = 50;
export const MAX_ATTENDEE_ROWS = 8000;
export const MIN_NAME_SCORE = 70;

export type AttendeeStatus = "pending" | "found" | "no_contacts" | "not_found";

export type AttendeeRow = {
  id: string;
  name: string;
  rawName: string;
  title: string;
  company: string;
  rawCompany: string;
};

export type AttendeeEntry = AttendeeRow & {
  status: AttendeeStatus;
};

export type AttendeeLoadStats = {
  rows: number;
  unique: number;
  skippedEmpty: number;
  skippedInvalid: number;
  skippedDuplicate: number;
};

export type AttendeeExtract = {
  attendees: AttendeeRow[];
  columnLabels: { name: string; title: string | null; company: string };
  loadStats: AttendeeLoadStats;
};

export type AttendeeQueue = {
  id: number;
  fileLabel: string;
  columnLabels: AttendeeExtract["columnLabels"];
  entries: AttendeeEntry[];
  loadStats: AttendeeLoadStats;
};

export type AttendeeQueueStats = {
  total: number;
  reviewed: number;
  pending: number;
  found: number;
  noContacts: number;
  notFound: number;
};

const HONORIFICS = new Set([
  "sr",
  "sra",
  "srta",
  "don",
  "dona",
  "doña",
  "dr",
  "dra",
  "ing",
  "lic",
  "prof",
  "phd",
  "md",
  "mr",
  "mrs",
  "ms",
  "miss",
]);

function fold(value: string): string {
  return value
    .toLowerCase()
    // Algunos caracteres latinos no se descomponen con NFD.
    .replace(/ß/g, "ss")
    .replace(/[æǽ]/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/[øö]/g, "o")
    .replace(/[ðđ]/g, "d")
    .replace(/ł/g, "l")
    .replace(/þ/g, "th")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cellText(value: unknown): string {
  return sanitizeSpreadsheetText(value);
}

function headerKind(label: string): "name" | "title" | "company" | null {
  const folded = fold(label);
  if (!folded || folded.length > 80) return null;
  if (
    /^(nombre|nombre completo|nombre del contacto|nombre contacto|contacto|persona|asistente|participante|attendee|full name|name)$/.test(
      folded
    )
  ) {
    return "name";
  }
  if (/^(cargo|puesto|titulo|rol|role|posicion|job title|title)$/.test(folded)) return "title";
  if (
    /^(empresa|company|compania|organizacion|organization|razon social|nombre de la empresa|nombre empresa|nombre de empresa)$/.test(
      folded
    )
  ) {
    return "company";
  }
  return null;
}

/** Quita tratamientos, credenciales y el recorte «…» de listados de feria. */
export function cleanPersonName(raw: string): string {
  let text = cellText(raw);
  if (!text) return "";
  const truncated = /[.…\uFFFD\u25C6\u2666]+$/.test(text) || text.includes("…");
  text = text.replace(/[.…\uFFFD\u25C6\u2666]+/g, " ").replace(/\s+/g, " ").trim();
  const comma = text.split(",")[0]?.trim() ?? text;
  text = comma || text;
  const tokens = text.split(" ").filter(Boolean);
  const kept: string[] = [];
  for (const token of tokens) {
    const folded = fold(token.replace(/[.]/g, ""));
    if (HONORIFICS.has(folded)) continue;
    kept.push(token.replace(/[.]/g, ""));
  }
  if (truncated && kept.length > 2) kept.pop();
  return kept.join(" ").slice(0, 80).trim();
}

const NAME_STOP = new Set(["de", "del", "la", "las", "los", "y", "da", "do", "dos", "van", "von", "of"]);

export function nameTokens(value: string): string[] {
  return fold(cleanPersonName(value))
    .split(" ")
    .map((token) => token.replace(/[^a-z0-9]/g, ""))
    .filter((token) => token.length >= 2 && !NAME_STOP.has(token));
}

function lastNames(tokens: string[]): string[] {
  if (tokens.length < 2) return tokens.slice(-1);
  return [tokens[tokens.length - 1], tokens.slice(-2).join(" ")];
}

function tokenLikelySame(left: string, right: string): boolean {
  if (left === right) return true;
  if (left.length >= 4 && right.length >= 4 && (right.startsWith(left) || left.startsWith(right))) return true;
  if (left.length < 5 || right.length < 5) return false;
  const limit = Math.max(left.length, right.length) >= 8 ? 2 : 1;
  return editDistanceAtMost(left, right, limit);
}

/** Distancia de edición acotada para tolerar un error de digitación sin abrir coincidencias cortas. */
function editDistanceAtMost(left: string, right: string, limit: number): boolean {
  if (Math.abs(left.length - right.length) > limit) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row++) {
    const current = [row];
    let minimum = current[0];
    for (let column = 1; column <= right.length; column++) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      const value = Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + cost);
      current.push(value);
      minimum = Math.min(minimum, value);
    }
    if (minimum > limit) return false;
    previous = current;
  }
  return previous[right.length] <= limit;
}

function allQueryTokensInCandidate(query: string[], candidate: string[]): boolean {
  return query.every((token) => candidate.some((other) => tokenLikelySame(token, other)));
}

/** Puntaje 0–100. 70 o más es la misma persona (sirve con nombres recortados). */
export function nameScore(query: string, candidate: string): number {
  const a = nameTokens(query);
  const b = nameTokens(candidate);
  if (!a.length || !b.length) return 0;
  const joinA = a.join(" ");
  const joinB = b.join(" ");
  if (joinA === joinB) return 100;
  if (joinB.startsWith(joinA) || joinA.startsWith(joinB)) return 92;
  if (allQueryTokensInCandidate(a, b) && a.length >= 2) return 90;
  if (allQueryTokensInCandidate(b, a) && b.length >= 2) return 90;

  const lastA = lastNames(a);
  const lastB = lastNames(b);
  const lastMatch = lastA.some((left) => lastB.some((right) => tokenLikelySame(left, right)));
  const firstA = a[0];
  const firstB = b[0];
  const firstMatch = tokenLikelySame(firstA, firstB);
  const firstInitial = firstA[0] === firstB[0];

  if (lastMatch && firstMatch) return 88;
  if (lastMatch && firstInitial && a.length >= 2 && b.length >= 2) return 72;
  return 0;
}

export function namesMatch(query: string, candidate: string): boolean {
  return nameScore(query, candidate) >= MIN_NAME_SCORE;
}

function emptyStats(): AttendeeLoadStats {
  return { rows: 0, unique: 0, skippedEmpty: 0, skippedInvalid: 0, skippedDuplicate: 0 };
}

function cellsOf(row: unknown): string[] {
  if (!Array.isArray(row)) return [];
  return row.map((cell) => cellText(cell));
}

/** Detecta si el archivo es una lista de personas (Nombre + Empresa), no solo empresas. */
export function isAttendeeMatrix(matrix: unknown[][]): boolean {
  const rows = matrix.map(cellsOf).filter((row) => row.some((cell) => cell.length > 0));
  const header = rows[0] ?? [];
  const kinds = header.map(headerKind);
  return kinds.includes("name") && kinds.includes("company");
}

export function extractAttendees(matrix: unknown[][]): AttendeeExtract | null {
  const rows = matrix.map(cellsOf).filter((row) => row.some((cell) => cell.length > 0));
  if (!rows.length) return null;

  let headerRow = -1;
  let nameCol = -1;
  let titleCol = -1;
  let companyCol = -1;
  const scan = Math.min(rows.length, 8);
  for (let rowIndex = 0; rowIndex < scan; rowIndex++) {
    for (let colIndex = 0; colIndex < rows[rowIndex].length; colIndex++) {
      const kind = headerKind(rows[rowIndex][colIndex]);
      if (!kind) continue;
      if (headerRow < 0) headerRow = rowIndex;
      if (kind === "name") nameCol = colIndex;
      if (kind === "title") titleCol = colIndex;
      if (kind === "company") companyCol = colIndex;
    }
    if (nameCol >= 0 && companyCol >= 0) break;
  }
  if (nameCol < 0 || companyCol < 0 || headerRow < 0) return null;

  const attendees: AttendeeRow[] = [];
  const seen = new Set<string>();
  const stats = emptyStats();

  for (let rowIndex = headerRow + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const rawName = row[nameCol] ?? "";
    const rawCompany = row[companyCol] ?? "";
    const rawTitle = titleCol >= 0 ? row[titleCol] ?? "" : "";
    stats.rows += 1;
    if (!rawName.trim() && !rawCompany.trim()) {
      stats.skippedEmpty += 1;
      continue;
    }
    const name = cleanPersonName(rawName);
    const company = cleanCompanyName(rawCompany) || parseCompanyCell(rawCompany).name;
    if (!name || !company) {
      stats.skippedInvalid += 1;
      continue;
    }
    const key = `${fold(name)}|${fold(company)}`;
    if (seen.has(key)) {
      stats.skippedDuplicate += 1;
      continue;
    }
    seen.add(key);
    attendees.push({
      id: `${attendees.length}-${key.slice(0, 40)}`,
      name,
      rawName,
      title: cellText(rawTitle).replace(/[.…]+$/g, "").slice(0, 80),
      company,
      rawCompany,
    });
  }

  stats.unique = attendees.length;
  return {
    attendees,
    columnLabels: {
      name: rows[headerRow][nameCol] ?? "Nombre",
      title: titleCol >= 0 ? rows[headerRow][titleCol] ?? null : null,
      company: rows[headerRow][companyCol] ?? "Empresa",
    },
    loadStats: stats,
  };
}

export function createAttendeeQueue(
  fileLabel: string,
  extract: AttendeeExtract
): AttendeeQueue {
  return {
    id: Date.now(),
    fileLabel,
    columnLabels: extract.columnLabels,
    loadStats: extract.loadStats,
    entries: extract.attendees.map((row) => ({ ...row, status: "pending" })),
  };
}

export function attendeeQueueStats(queue: AttendeeQueue): AttendeeQueueStats {
  const stats: AttendeeQueueStats = {
    total: queue.entries.length,
    reviewed: 0,
    pending: 0,
    found: 0,
    noContacts: 0,
    notFound: 0,
  };
  for (const entry of queue.entries) {
    if (entry.status === "pending") stats.pending += 1;
    else stats.reviewed += 1;
    if (entry.status === "found") stats.found += 1;
    if (entry.status === "no_contacts") stats.noContacts += 1;
    if (entry.status === "not_found") stats.notFound += 1;
  }
  return stats;
}

export function nextPendingAttendees(queue: AttendeeQueue): AttendeeEntry[] {
  return queue.entries.filter((entry) => entry.status === "pending").slice(0, MAX_ATTENDEES_PER_BATCH);
}

export function isAttendeeQueue(value: unknown): value is AttendeeQueue {
  if (!value || typeof value !== "object") return false;
  const queue = value as AttendeeQueue;
  return Array.isArray(queue.entries) && typeof queue.fileLabel === "string";
}
