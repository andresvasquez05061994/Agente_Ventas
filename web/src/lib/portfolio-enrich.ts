import { companiesMatch, type PortfolioContact } from "./excel-document";
import { namesMatch } from "./excel-attendees";
import {
  searchCompany,
  searchCountry,
  searchName,
  searchTitle,
  valueOf,
  type EnrichColumn,
} from "./excel-enrich";
import { phoneMatchCandidates } from "./phone";
import type { ApolloPerson } from "./types";

export type PortfolioRowMatch = {
  people: ApolloPerson[];
  kind: "identity" | "company" | "title" | null;
};

function fold(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedLinkedIn(value: string | null | undefined): string {
  return fold(value)
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "")
    .replace(/\/$/, "");
}

function contactPhone(contact: PortfolioContact): string {
  return String(contact.telefono_e164 || contact.telefono || "").trim();
}

function isComplete(contact: PortfolioContact): boolean {
  return Boolean(contact.email?.trim() && contactPhone(contact));
}

function contactKey(contact: PortfolioContact): string {
  return `${fold(contact.email)}|${contactPhone(contact).replace(/\D/g, "")}`;
}

function toPerson(contact: PortfolioContact): ApolloPerson {
  const identity = fold(contact.email) || contactPhone(contact).replace(/\D/g, "") || fold(contact.nombre);
  return {
    apollo_id: `portfolio:${identity}`,
    nombre: contact.nombre,
    cargo: contact.cargo,
    empresa: contact.empresa,
    email: contact.email,
    telefono: contactPhone(contact),
    pais: contact.pais,
    linkedin_url: contact.linkedin_url,
  };
}

function uniqueComplete(contacts: PortfolioContact[], limit: number): ApolloPerson[] {
  const seen = new Set<string>();
  return contacts
    .filter(isComplete)
    .filter((contact) => {
      const key = contactKey(contact);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.nombre.localeCompare(right.nombre, "es"))
    .slice(0, Math.max(1, limit))
    .map(toPerson);
}

function titleMatches(query: string, candidate: string | null): boolean {
  const wanted = fold(query);
  const actual = fold(candidate);
  if (!wanted || !actual) return false;
  return actual.includes(wanted) || wanted.includes(actual);
}

function countryMatches(query: string, candidate: string | null): boolean {
  const wanted = fold(query);
  const actual = fold(candidate);
  return !wanted || !actual || wanted === actual || wanted.includes(actual) || actual.includes(wanted);
}

/** Un correo y un teléfono ya presentes no requieren una búsqueda externa. */
export function rowAlreadyComplete(row: string[], columns: EnrichColumn[]): boolean {
  const email = String(valueOf(row, columns, "email") ?? "").trim();
  const phone = String(valueOf(row, columns, "telefono") ?? "").trim();
  return Boolean(email && phone);
}

/**
 * Busca primero en el portafolio del propietario. Para personas, solo devuelve
 * coincidencias inequívocas; para empresa o cargo, devuelve contactos completos
 * y limita el resultado solicitado por el usuario.
 */
export function findPortfolioContacts(
  row: string[],
  columns: EnrichColumn[],
  contacts: PortfolioContact[],
  limit: number
): PortfolioRowMatch {
  const email = fold(valueOf(row, columns, "email"));
  const linkedIn = normalizedLinkedIn(valueOf(row, columns, "linkedin"));
  const phoneCandidates = new Set(phoneMatchCandidates(valueOf(row, columns, "telefono"), searchCountry(row, columns)));
  const name = searchName(row, columns);
  const company = searchCompany(row, columns);
  const title = searchTitle(row, columns);
  const country = searchCountry(row, columns);

  const exact = contacts.filter((contact) => {
    const contactEmail = fold(contact.email);
    const contactLinkedIn = normalizedLinkedIn(contact.linkedin_url);
    const contactPhones = phoneMatchCandidates(contactPhone(contact), contact.pais);
    return (
      Boolean(email && contactEmail === email) ||
      Boolean(linkedIn && contactLinkedIn === linkedIn) ||
      contactPhones.some((phone) => phoneCandidates.has(phone))
    );
  });
  const exactPeople = uniqueComplete(exact, 1);
  if (exactPeople.length) return { people: exactPeople, kind: "identity" };

  if (name) {
    const named = contacts.filter(
      (contact) =>
        namesMatch(name, contact.nombre) &&
        (!company || companiesMatch(company, String(contact.empresa ?? "")))
    );
    const people = uniqueComplete(named, 2);
    if (company && people.length) return { people: people.slice(0, 1), kind: "identity" };
    if (!company && people.length === 1) return { people, kind: "identity" };
    return { people: [], kind: null };
  }

  if (company || title) {
    const candidates = contacts.filter((contact) => {
      if (company && !companiesMatch(company, String(contact.empresa ?? ""))) return false;
      if (title && !titleMatches(title, contact.cargo)) return false;
      return countryMatches(country, contact.pais);
    });
    const people = uniqueComplete(candidates, limit);
    if (people.length) return { people, kind: company ? "company" : "title" };
  }

  return { people: [], kind: null };
}
