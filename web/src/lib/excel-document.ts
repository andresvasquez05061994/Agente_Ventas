import { namesMatch } from "./excel-attendees";

export const MISSING_COMPANY = "empresa no existente en el portafolio";
export const MISSING_CONTACT = "contacto no encontrado en el portafolio";
export const MISSING_FIELD = "sin dato";

export const MAX_DOCUMENT_ROWS = 3000;
export const MAX_ATTENDEE_DOCUMENT_ROWS = 8000;

export type DocumentField =
  | "telefono"
  | "email"
  | "cargo"
  | "nombre"
  | "linkedin"
  | "pais"
  | "estado"
  | "whatsapp"
  | "notas"
  | "fuente";

export type PortfolioContact = {
  nombre: string;
  cargo: string | null;
  empresa: string | null;
  email: string | null;
  telefono: string | null;
  telefono_e164?: string | null;
  pais: string | null;
  linkedin_url: string | null;
  lead_status: string;
  whatsapp_status?: string | null;
  notas?: string | null;
  fuente_busqueda?: string | null;
};

export type DocumentColumn = {
  header: string;
  field: DocumentField | null;
  company: boolean;
};

export type DocumentStats = {
  inputCompanies: number;
  found: number;
  withContacts: number;
  withoutCompleteContact: number;
  missing: number;
  personMissing?: number;
  outputRows: number;
  contactsWritten: number;
};

export type DocumentMode = "company" | "attendee";

export type DocumentedSheet = {
  mode: DocumentMode;
  headers: string[];
  rows: string[][];
  stats: DocumentStats;
  preview: string[][];
};

const LEGAL_TOKENS = new Set([
  "sas",
  "sa",
  "sca",
  "scs",
  "ltda",
  "limitada",
  "esp",
  "eu",
  "srl",
  "sl",
  "inc",
  "llc",
  "corp",
  "gmbh",
  "plc",
  "nv",
  "cv",
  "spa",
]);

const FIELD_RULES: { field: DocumentField; test: RegExp }[] = [
  { field: "whatsapp", test: /^(estado whatsapp|whatsapp status)$/ },
  { field: "telefono", test: /^(movil|celular|telefono|telefono movil|phone|mobile|cel|whatsapp)$/ },
  { field: "email", test: /^(correo|correo electronico|email|e mail|mail)$/ },
  { field: "cargo", test: /^(cargo|puesto|titulo|rol|role|posicion|job title)$/ },
  { field: "linkedin", test: /^(linkedin|linkedin url|url linkedin)$/ },
  { field: "pais", test: /^(pais|country)$/ },
  { field: "estado", test: /^(estado|estado del lead|status)$/ },
  { field: "notas", test: /^(notas|notes|observaciones)$/ },
  { field: "fuente", test: /^(fuente|fuente de busqueda|source)$/ },
  { field: "nombre", test: /^(nombre|nombre del contacto|nombre contacto|contacto|persona|nombre completo)$/ },
];

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cellText(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

/** Nombre comparable: sin tildes, puntuación ni forma jurídica. */
export function normalizeCompany(value: string): string {
  const tokens = fold(value)
    .replace(/[.&'’"`´,;:/\\_+()[\]{}-]/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
  while (tokens.length > 1 && LEGAL_TOKENS.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ");
}

function containsPhrase(longer: string, shorter: string): boolean {
  if (shorter.length < 2 || longer.length < shorter.length) return false;
  const escaped = shorter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^| )${escaped}(?: |$)`).test(longer);
}

/** El nombre del Excel está dentro del portafolio, o al revés, como palabras completas. */
export function companiesMatch(excelName: string, portfolioName: string): boolean {
  const excel = normalizeCompany(excelName);
  const portfolio = normalizeCompany(portfolioName);
  if (!excel || !portfolio) return false;
  if (excel === portfolio) return true;
  return containsPhrase(portfolio, excel) || containsPhrase(excel, portfolio);
}

export function isCompleteContact(contact: PortfolioContact): boolean {
  return Boolean(phoneOf(contact) && emailOf(contact));
}

function phoneOf(contact: PortfolioContact): string {
  return cellText(contact.telefono) || cellText(contact.telefono_e164);
}

function emailOf(contact: PortfolioContact): string {
  return cellText(contact.email);
}

export function fieldValue(contact: PortfolioContact, field: DocumentField): string {
  switch (field) {
    case "telefono":
      return phoneOf(contact);
    case "email":
      return emailOf(contact);
    case "cargo":
      return cellText(contact.cargo);
    case "nombre":
      return cellText(contact.nombre);
    case "linkedin":
      return cellText(contact.linkedin_url);
    case "pais":
      return cellText(contact.pais);
    case "estado":
      return cellText(contact.lead_status);
    case "whatsapp":
      return cellText(contact.whatsapp_status);
    case "notas":
      return cellText(contact.notas);
    case "fuente":
      return cellText(contact.fuente_busqueda);
    default:
      return "";
  }
}

function isCompanyHeader(label: string): boolean {
  const folded = fold(label);
  return (
    folded === "empresa" ||
    folded === "company" ||
    folded === "compania" ||
    folded === "organizacion" ||
    folded === "organization" ||
    folded === "razon social" ||
    folded === "nombre de empresa" ||
    folded === "nombre de la empresa" ||
    folded === "nombre empresa"
  );
}

function fieldFromHeader(label: string): DocumentField | null {
  const folded = fold(label);
  if (!folded || isCompanyHeader(label)) return null;
  return FIELD_RULES.find((rule) => rule.test.test(folded))?.field ?? null;
}

export function findHeaderRow(matrix: unknown[][]): number {
  const limit = Math.min(matrix.length, 20);
  for (let index = 0; index < limit; index += 1) {
    const row = matrix[index] ?? [];
    if (row.some((cell) => isCompanyHeader(cellText(cell)))) return index;
  }
  return -1;
}

export function columnsFromHeader(header: unknown[]): DocumentColumn[] {
  return header.map((cell) => {
    const label = cellText(cell);
    return {
      header: label,
      company: isCompanyHeader(label),
      field: fieldFromHeader(label),
    };
  });
}

function contactKey(contact: PortfolioContact): string {
  return `${emailOf(contact).toLowerCase()}|${phoneOf(contact).replace(/\D/g, "")}`;
}

export function contactsForCompany(
  excelName: string,
  contacts: PortfolioContact[]
): { matched: boolean; complete: PortfolioContact[] } {
  const matched = contacts.filter((contact) => companiesMatch(excelName, cellText(contact.empresa)));
  const seen = new Set<string>();
  const complete = matched.filter(isCompleteContact).filter((contact) => {
    const key = contactKey(contact);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  complete.sort((a, b) => cellText(a.nombre).localeCompare(cellText(b.nombre), "es"));
  return { matched: matched.length > 0, complete };
}

function fillRow(
  columns: DocumentColumn[],
  companyName: string,
  source: "missing" | "empty" | PortfolioContact
): string[] {
  return columns.map((column) => {
    if (column.company) return companyName;
    if (source === "missing") return MISSING_COMPANY;
    if (source === "empty" || !column.field) return MISSING_FIELD;
    return fieldValue(source, column.field) || MISSING_FIELD;
  });
}

function ensureContactColumns(columns: DocumentColumn[]): DocumentColumn[] {
  const next = [...columns];
  if (!next.some((column) => column.field === "telefono")) {
    next.push({ header: "Móvil", field: "telefono", company: false });
  }
  if (!next.some((column) => column.field === "email")) {
    next.push({ header: "Correo", field: "email", company: false });
  }
  return next;
}

function contactForAttendee(
  name: string,
  companyName: string,
  contacts: PortfolioContact[]
): { companyMatched: boolean; contact: PortfolioContact | null } {
  const atCompany = contacts.filter((contact) => companiesMatch(companyName, cellText(contact.empresa)));
  if (!atCompany.length) return { companyMatched: false, contact: null };
  const named = atCompany.filter((contact) => namesMatch(name, cellText(contact.nombre)));
  const complete = named.find(isCompleteContact) ?? null;
  return { companyMatched: true, contact: complete };
}

function fillAttendeeRow(
  original: unknown[],
  columns: DocumentColumn[],
  source: "missing-company" | "missing-person" | "empty" | PortfolioContact
): string[] {
  return columns.map((column, index) => {
    const originalValue = cellText(original[index]);
    if (column.company || column.field === "nombre" || column.field === "cargo") {
      return originalValue;
    }
    if (!column.field) return originalValue;
    if (source === "missing-company") return MISSING_COMPANY;
    if (source === "missing-person") return MISSING_CONTACT;
    if (source === "empty") return originalValue || MISSING_FIELD;
    return fieldValue(source, column.field) || originalValue || MISSING_FIELD;
  });
}

function documentAttendeeMatrix(
  columns: DocumentColumn[],
  dataRows: unknown[][],
  contacts: PortfolioContact[]
): DocumentedSheet {
  const cols = ensureContactColumns(columns);
  const nameIndex = cols.findIndex((column) => column.field === "nombre");
  const companyIndex = cols.findIndex((column) => column.company);
  const stats: DocumentStats = {
    inputCompanies: 0,
    found: 0,
    withContacts: 0,
    withoutCompleteContact: 0,
    missing: 0,
    personMissing: 0,
    outputRows: 0,
    contactsWritten: 0,
  };
  const output: string[][] = [];

  for (const row of dataRows) {
    const companyName = cellText(row?.[companyIndex]);
    const personName = cellText(row?.[nameIndex]);
    if (!companyName && !personName) continue;
    stats.inputCompanies += 1;
    if (!companyName || !personName) {
      stats.missing += 1;
      output.push(fillAttendeeRow(row ?? [], cols, "missing-company"));
      continue;
    }
    const { companyMatched, contact } = contactForAttendee(personName, companyName, contacts);
    if (!companyMatched) {
      stats.missing += 1;
      output.push(fillAttendeeRow(row ?? [], cols, "missing-company"));
      continue;
    }
    stats.found += 1;
    if (!contact) {
      stats.personMissing = (stats.personMissing ?? 0) + 1;
      stats.withoutCompleteContact += 1;
      output.push(fillAttendeeRow(row ?? [], cols, "missing-person"));
      continue;
    }
    stats.withContacts += 1;
    stats.contactsWritten += 1;
    output.push(fillAttendeeRow(row ?? [], cols, contact));
  }

  stats.outputRows = output.length;
  return {
    mode: "attendee",
    headers: cols.map((column) => column.header),
    rows: output,
    stats,
    preview: output.slice(0, 12),
  };
}

export function documentMatrix(matrix: unknown[][], contacts: PortfolioContact[]): DocumentedSheet {
  const headerIndex = findHeaderRow(matrix);
  if (headerIndex < 0) {
    throw new Error(
      "No encuentro la columna de empresa. El encabezado debe decir Nombre de empresa, Empresa o Razón social."
    );
  }

  const columns = columnsFromHeader(matrix[headerIndex] ?? []);
  if (!columns.some((column) => column.company)) {
    throw new Error("No encuentro la columna de empresa.");
  }

  const dataRows = matrix.slice(headerIndex + 1);
  const isAttendee = columns.some((column) => column.field === "nombre");
  const maxRows = isAttendee ? MAX_ATTENDEE_DOCUMENT_ROWS : MAX_DOCUMENT_ROWS;
  const companyRows = dataRows.filter((row) =>
    columns.some((column, index) => column.company && cellText(row?.[index]))
  );
  if (companyRows.length > maxRows) {
    throw new Error(
      isAttendee
        ? `El archivo trae más de ${MAX_ATTENDEE_DOCUMENT_ROWS} personas. Divídelo y vuelve a subirlo.`
        : `El archivo trae más de ${MAX_DOCUMENT_ROWS} empresas. Divídelo y vuelve a subirlo.`
    );
  }

  if (isAttendee) {
    return documentAttendeeMatrix(columns, dataRows, contacts);
  }

  const output: string[][] = [];
  const stats: DocumentStats = {
    inputCompanies: 0,
    found: 0,
    withContacts: 0,
    withoutCompleteContact: 0,
    missing: 0,
    outputRows: 0,
    contactsWritten: 0,
  };

  for (const row of dataRows) {
    const companyColumn = columns.findIndex((column) => column.company);
    const companyName = cellText(row?.[companyColumn]);
    if (!companyName) {
      const hasOther = (row ?? []).some((cell, index) => index !== companyColumn && cellText(cell));
      if (hasOther) output.push(columns.map((_, index) => cellText(row?.[index])));
      continue;
    }

    stats.inputCompanies += 1;
    const { matched, complete } = contactsForCompany(companyName, contacts);
    if (!matched) {
      stats.missing += 1;
      output.push(fillRow(columns, companyName, "missing"));
      continue;
    }

    stats.found += 1;
    if (complete.length === 0) {
      stats.withoutCompleteContact += 1;
      output.push(fillRow(columns, companyName, "empty"));
      continue;
    }

    stats.withContacts += 1;
    stats.contactsWritten += complete.length;
    for (const contact of complete) output.push(fillRow(columns, companyName, contact));
  }

  stats.outputRows = output.length;
  return {
    mode: "company",
    headers: columns.map((column) => column.header),
    rows: output,
    stats,
    preview: output.slice(0, 12),
  };
}
