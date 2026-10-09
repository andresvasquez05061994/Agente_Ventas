/** Máximo de empresas por tanda para no agotar créditos de Apollo de un solo clic. */
export const MAX_EXCEL_COMPANIES = 20;

export type ExcelCompanyRow = {
  /** Razón social limpia que se envía a Apollo. */
  name: string;
  /** Texto tal como venía en la celda. */
  rawName: string;
  /** Sigla o nombre comercial detectado en la celda (FINDETER, FIDUPREVISORA, HITOS…). */
  alias: string | null;
};

export type ExcelCompanyExtract = {
  companies: ExcelCompanyRow[];
  totalFound: number;
  columnLabel: string | null;
};

export type ExcelCompanyStatus = "pending" | "found" | "no_contacts" | "not_found";

export type ExcelCompanyEntry = ExcelCompanyRow & {
  status: ExcelCompanyStatus;
  contacts: number;
  apolloName: string | null;
  /** Registros de Apollo que corresponden a esta empresa (puede haber duplicados en Apollo). */
  apolloIds: string[];
};

export type ExcelCompanyQueue = {
  id: number;
  fileLabel: string;
  columnLabel: string | null;
  entries: ExcelCompanyEntry[];
};

export type ExcelQueueStats = {
  total: number;
  reviewed: number;
  pending: number;
  withContacts: number;
  noContacts: number;
  notFound: number;
  withoutContacts: number;
  contacts: number;
};

const ALLOWED_COMPANY_CHAR = /[\w\s.&'´\-áéíóúñÁÉÍÓÚÑ]/u;

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function headerScore(label: string): number {
  const folded = fold(label);
  if (!folded || folded.length > 80) return 0;
  if (
    /^(empresa|company|compania|organizacion|organization|razon social|nombre de la empresa|nombre empresa)$/.test(
      folded
    )
  ) {
    return 100;
  }
  if (/empresa|company|compania|organizacion|razon social|nombre de la empresa/.test(folded)) {
    return 70;
  }
  if (/^(cliente|account|cuenta)$/.test(folded)) return 40;
  return 0;
}

function isHeaderLabel(value: string): boolean {
  const folded = fold(value);
  if (!folded) return false;
  return /^(empresa|company|compania|organizacion|organization|razon social|nombre de la empresa|nombre empresa|cliente|account|cuenta|nit|id|email|correo|telefono|cargo|pais|nombre|contacto)$/.test(
    folded
  );
}

/** Formas jurídicas habituales (Colombia/LatAm y genéricas). */
const LEGAL_FORM =
  /\b(?:S\.?\s?A\.?\s?S\.?|S\.?\s?A\.?|S\.?\s?C\.?\s?A\.?|S\.?\s?C\.?\s?S\.?|S\.?\s?EN\s?C\.?(?:\s?S\.?|\s?A\.?)?|LTDA\.?|LIMITADA|E\.?\s?S\.?\s?P\.?|E\.\s?U\.?|B\.?\s?I\.?\s?C\.?|S\.?\s?R\.?\s?L\.?|S\.?\s?L\.?|S\.?\s?A\.?\s?P\.?\s?I\.?|S\.?\s?A\.?\s?de\s?C\.?\s?V\.?|INC\.?|LLC|CORP\.?|GMBH|PLC|N\.?\s?V\.?)(?=[\s,;.)]|$)/i;

const LEGAL_STATUS_CLAUSE =
  /\b(?:en|in)\s+(?:reorganizaci[oó]n|liquidaci[oó]n|reestructuraci[oó]n|concordato|intervenci[oó]n|acuerdo\s+de\s+reestructuraci[oó]n|proceso\s+de\s+\w+)\b.*$/i;

const LEGAL_NOTE_CLAUSE =
  /\b(?:la\s+cual|el\s+cual|quien|quienes|podr[aá]n?|pudiendo|tambi[eé]n|girar[aá]?|utilizar[aá]?|se\s+identifica|identificad[ao]s?|sigla|cuya\s+sigla|denominada|denominaci[oó]n)\b.*$/i;

const LOWER_CONNECTORS = new Set([
  "de", "del", "la", "las", "los", "el", "y", "e", "en", "para", "por", "con", "al", "a", "o", "u", "the", "of", "and",
]);

const ALIAS_AFTER_KEYWORD = /\b(?:sigla|siglas|denominaci[oó]n|denominada|conocida como|nombre comercial)\s*:?\s*["“«']?([\p{Lu}][\p{L}\d&.\-]{2,})/iu;

const GENERIC_ALIAS_WORDS = new Set([
  "empresa", "empresas", "servicios", "compania", "compañia", "compañía", "sociedad", "grupo", "entidad",
  "publicos", "públicos", "publica", "pública", "privada", "mixta", "industrial", "comercial", "nacional",
]);

function trimEdges(value: string): string {
  return value.replace(/^[\s,;:\-–."“«']+|[\s,;:\-–"”»']+$/gu, "").trim();
}

function isUpperWord(word: string): boolean {
  const letters = word.replace(/[^\p{L}]/gu, "");
  return letters.length >= 2 && letters === letters.toUpperCase();
}

function isLowerWord(word: string): boolean {
  const letters = word.replace(/[^\p{L}]/gu, "");
  return letters.length >= 2 && letters === letters.toLowerCase() && !LOWER_CONNECTORS.has(letters.toLowerCase());
}

/**
 * Separa la razón social del texto adicional que suele traer la celda
 * ("BANCOLOMBIA S.A. podrá girar también...", "GASES DEL CARIBE S.A. EMPRESA DE SERVICIOS PUBLICOS",
 * "FINANCIERA DE DESARROLLO TERRITORIAL S.A. FINDETER") y detecta la sigla si existe.
 */
export function parseCompanyCell(raw: string): { name: string; alias: string | null } {
  let text = raw.replace(/\s+/g, " ").trim();
  if (!text) return { name: "", alias: null };

  let alias: string | null = null;
  const keywordAlias = ALIAS_AFTER_KEYWORD.exec(text);
  if (keywordAlias) alias = trimEdges(keywordAlias[1]);

  // 1. Notas entre paréntesis/corchetes o separadas por ; |
  text = text.split(/\s*[;|]\s*|\s*[([]/)[0].trim();

  // 2. Estado jurídico y cláusulas notariales
  text = text.replace(LEGAL_STATUS_CLAUSE, "").trim();
  text = text.replace(LEGAL_NOTE_CLAUSE, "").trim();

  // 3. Nombre en mayúsculas seguido de texto en minúsculas: ahí empieza la nota
  const words = text.split(" ");
  if (isUpperWord(words[0] ?? "")) {
    for (let i = 1; i < words.length; i++) {
      if (isLowerWord(words[i])) {
        if (i >= 2) text = words.slice(0, i).join(" ");
        break;
      }
    }
  }

  // 4. Ancla en la forma jurídica: lo que sigue después de "S.A." / "LTDA" / "E.S.P." sobra,
  //    salvo que sea una sigla corta (FINDETER, HITOS), que se conserva como alias.
  const match = LEGAL_FORM.exec(text);
  if (match && match.index > 0) {
    let end = match.index + match[0].length;
    for (;;) {
      const rest = text.slice(end);
      const chained = /^\s*[,.-]?\s*/.exec(rest);
      const after = rest.slice(chained?.[0].length ?? 0);
      const next = LEGAL_FORM.exec(after);
      if (!next || next.index !== 0) break;
      end += (chained?.[0].length ?? 0) + next[0].length;
    }
    const remainder = trimEdges(text.slice(end));
    text = text.slice(0, end);

    if (!alias && remainder) {
      const remainderWords = remainder.split(" ");
      const generic = remainderWords.some((w) => GENERIC_ALIAS_WORDS.has(w.toLowerCase()));
      if (remainderWords.length <= 2 && remainder.length <= 30 && !generic) alias = remainder;
    }
  }

  const name = trimEdges(text);
  if (alias && alias.toLowerCase() === name.toLowerCase()) alias = null;
  return { name, alias };
}

/** Razón social sin el texto adicional de la celda. */
export function extractLegalName(raw: string): string {
  return parseCompanyCell(raw).name;
}

/** Deja el nombre en el formato que acepta la búsqueda de Apollo. */
export function cleanCompanyName(raw: string): string {
  return sanitizeCompanyText(extractLegalName(raw));
}

function sanitizeCompanyText(value: string): string {
  const cleaned = Array.from(value)
    .filter((char) => ALLOWED_COMPANY_CHAR.test(char))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (cleaned.length < 2) return "";
  if (/^[\d\s.]+$/.test(cleaned)) return "";
  return cleaned;
}

function cellsOf(row: unknown): string[] {
  if (!Array.isArray(row)) return [];
  return row.map((cell) => {
    if (cell == null || cell instanceof Date) return "";
    return String(cell).replace(/\s+/g, " ").trim();
  });
}

export function extractCompanyNames(matrix: unknown[][]): ExcelCompanyExtract {
  const rows = matrix.map(cellsOf).filter((row) => row.some((cell) => cell.length > 0));
  if (!rows.length) {
    return { companies: [], totalFound: 0, columnLabel: null };
  }

  let header: { row: number; col: number; label: string; score: number } | null = null;
  const scan = Math.min(rows.length, 8);
  for (let rowIndex = 0; rowIndex < scan; rowIndex++) {
    for (let colIndex = 0; colIndex < rows[rowIndex].length; colIndex++) {
      const label = rows[rowIndex][colIndex];
      const score = headerScore(label);
      if (score > 0 && (!header || score > header.score)) {
        header = { row: rowIndex, col: colIndex, label, score };
      }
    }
  }

  let column = 0;
  let startRow = 0;
  let columnLabel: string | null = null;
  if (header && header.score >= 40) {
    column = header.col;
    startRow = header.row + 1;
    columnLabel = header.label;
  } else {
    const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
    let bestCount = -1;
    for (let colIndex = 0; colIndex < width; colIndex++) {
      let count = 0;
      for (const row of rows) {
        const value = row[colIndex] ?? "";
        if (cleanCompanyName(value) && !isHeaderLabel(value)) count++;
      }
      if (count > bestCount) {
        bestCount = count;
        column = colIndex;
      }
    }
  }

  const seen = new Set<string>();
  const all: ExcelCompanyRow[] = [];
  for (let rowIndex = startRow; rowIndex < rows.length; rowIndex++) {
    const raw = rows[rowIndex][column] ?? "";
    if (isHeaderLabel(raw)) continue;
    const parsed = parseCompanyCell(raw);
    const name = sanitizeCompanyText(parsed.name);
    if (!name) continue;
    const key = fold(name);
    if (seen.has(key)) continue;
    seen.add(key);
    const alias = parsed.alias ? sanitizeCompanyText(parsed.alias) || null : null;
    all.push({ name, rawName: raw, alias });
  }

  return {
    companies: all,
    totalFound: all.length,
    columnLabel,
  };
}

export function createExcelQueue(
  fileLabel: string,
  columnLabel: string | null,
  companies: Array<ExcelCompanyRow | string>
): ExcelCompanyQueue {
  return {
    id: Date.now(),
    fileLabel,
    columnLabel,
    entries: companies.map((row) => {
      const base: ExcelCompanyRow =
        typeof row === "string" ? { name: row, rawName: row, alias: null } : row;
      return { ...base, status: "pending", contacts: 0, apolloName: null, apolloIds: [] };
    }),
  };
}

export function excelQueueStats(queue: ExcelCompanyQueue): ExcelQueueStats {
  const stats: ExcelQueueStats = {
    total: queue.entries.length,
    reviewed: 0,
    pending: 0,
    withContacts: 0,
    noContacts: 0,
    notFound: 0,
    withoutContacts: 0,
    contacts: 0,
  };
  for (const entry of queue.entries) {
    stats.contacts += entry.contacts;
    if (entry.status === "pending") stats.pending++;
    else stats.reviewed++;
    if (entry.status === "found") stats.withContacts++;
    if (entry.status === "no_contacts") stats.noContacts++;
    if (entry.status === "not_found") stats.notFound++;
  }
  stats.withoutContacts = stats.total - stats.withContacts;
  return stats;
}

/** Siguiente tanda: hasta 20 empresas que aún no se han revisado, en el orden del archivo. */
export function nextPendingBatch(queue: ExcelCompanyQueue): string[] {
  return queue.entries
    .filter((entry) => entry.status === "pending")
    .slice(0, MAX_EXCEL_COMPANIES)
    .map((entry) => entry.name);
}

export async function readCompanyNamesFromBuffer(
  buffer: ArrayBuffer,
  filename: string
): Promise<ExcelCompanyExtract> {
  const XLSX = await import("xlsx");
  const lower = filename.toLowerCase();
  const text = lower.endsWith(".csv") || lower.endsWith(".txt") ? decodeCsv(buffer) : "";
  const workbook = text
    ? XLSX.read(text, { type: "string", FS: csvSeparator(text) })
    : XLSX.read(buffer, { type: "array" });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { companies: [], totalFound: 0, columnLabel: null };
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  }) as unknown[][];

  return extractCompanyNames(rows);
}

function decodeCsv(buffer: ArrayBuffer): string {
  let text = new TextDecoder("utf-8").decode(buffer);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

function csvSeparator(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const semicolons = first.split(";").length;
  const commas = first.split(",").length;
  return semicolons > commas ? ";" : ",";
}
