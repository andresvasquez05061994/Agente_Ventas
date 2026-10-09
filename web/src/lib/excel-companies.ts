/** Máximo de empresas por tanda para no agotar créditos de Apollo de un solo clic. */
export const MAX_EXCEL_COMPANIES = 20;

export type ExcelCompanyExtract = {
  companies: string[];
  totalFound: number;
  truncated: boolean;
  columnLabel: string | null;
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

/** Deja el nombre en el formato que acepta la búsqueda de Apollo. */
export function cleanCompanyName(raw: string): string {
  const cleaned = Array.from(raw)
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
    return { companies: [], totalFound: 0, truncated: false, columnLabel: null };
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
  const all: string[] = [];
  for (let rowIndex = startRow; rowIndex < rows.length; rowIndex++) {
    const raw = rows[rowIndex][column] ?? "";
    if (isHeaderLabel(raw)) continue;
    const name = cleanCompanyName(raw);
    if (!name) continue;
    const key = fold(name);
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(name);
  }

  return {
    companies: all.slice(0, MAX_EXCEL_COMPANIES),
    totalFound: all.length,
    truncated: all.length > MAX_EXCEL_COMPANIES,
    columnLabel,
  };
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
    return { companies: [], totalFound: 0, truncated: false, columnLabel: null };
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
