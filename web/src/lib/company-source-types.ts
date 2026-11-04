/** Valores seguros para compartir entre componentes cliente y rutas del servidor. */
export const DECLARED_COMPANY_SOURCES = [
  "Supersociedades",
  "RUES",
  "Cámara de comercio",
  "Archivo oficial",
  "Base propia",
] as const;

export type DeclaredCompanySource = (typeof DECLARED_COMPANY_SOURCES)[number];
