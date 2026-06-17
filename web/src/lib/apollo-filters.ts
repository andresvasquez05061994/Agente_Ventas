/** Valores alineados con los filtros de Apollo (person_locations, person_titles, q_keywords). */

export const APOLLO_COUNTRIES = [
  { label: "Colombia", value: "Colombia" },
  { label: "México", value: "Mexico" },
  { label: "Brasil", value: "Brazil" },
  { label: "Argentina", value: "Argentina" },
  { label: "Chile", value: "Chile" },
  { label: "Perú", value: "Peru" },
  { label: "Ecuador", value: "Ecuador" },
  { label: "Panamá", value: "Panama" },
  { label: "Estados Unidos", value: "United States" },
  { label: "España", value: "Spain" },
] as const;

/** Cargos en inglés — formato que Apollo indexa correctamente. */
export const APOLLO_JOB_TITLES = [
  { label: "Director de TI / IT Director", value: "IT Director" },
  { label: "Director de Tecnología", value: "Director of Technology" },
  { label: "Director de Sistemas", value: "Director of Information Technology" },
  { label: "CTO", value: "CTO" },
  { label: "CIO", value: "CIO" },
  { label: "VP de Ingeniería", value: "VP of Engineering" },
  { label: "Jefe de TI", value: "Head of IT" },
  { label: "Gerente de TI", value: "IT Manager" },
  { label: "CEO", value: "CEO" },
  { label: "Director General", value: "Managing Director" },
  { label: "Director", value: "Director" },
  { label: "Gerente General", value: "General Manager" },
] as const;

export const APOLLO_KEYWORDS = [
  { label: "Sin filtro de industria", value: "" },
  { label: "Construcción", value: "construction" },
  { label: "Software / Tecnología", value: "software" },
  { label: "Manufactura", value: "manufacturing" },
  { label: "Servicios financieros", value: "financial services" },
  { label: "Salud", value: "healthcare" },
  { label: "Retail / Comercio", value: "retail" },
  { label: "Logística", value: "logistics" },
  { label: "Telecomunicaciones", value: "telecommunications" },
  { label: "Energía", value: "energy" },
  { label: "Educación", value: "education" },
] as const;

export const APOLLO_SENIORITIES = [
  { label: "Cualquier nivel", value: "" },
  { label: "C-Suite", value: "c_suite" },
  { label: "VP", value: "vp" },
  { label: "Director", value: "director" },
  { label: "Head", value: "head" },
  { label: "Manager", value: "manager" },
] as const;

export const DEFAULT_SEARCH = {
  country: "Colombia",
  titles: ["IT Director"] as string[],
  keyword: "",
  seniority: "",
  perPage: 25,
};
