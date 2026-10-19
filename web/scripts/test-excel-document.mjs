/**
 * Documentar Excel desde el portafolio.
 * node --experimental-strip-types scripts/test-excel-document.mjs
 */
import {
  MISSING_COMPANY,
  MISSING_FIELD,
  companiesMatch,
  documentMatrix,
} from "../src/lib/excel-document.ts";

const headers = ["NOMBRE DE EMPRESA", "MÓVIL", "CORREO", "CARGO", "LINKEDIN"];

function contact(partial) {
  return {
    nombre: "Ana Pérez",
    cargo: "Gerente",
    empresa: "Fundación Barco S.A.S.",
    email: "ana@barco.org",
    telefono: "+57 300 111 2233",
    pais: "Colombia",
    linkedin_url: "https://linkedin.com/in/ana",
    lead_status: "Nuevo",
    ...partial,
  };
}

const portfolio = [
  contact({}),
  contact({
    nombre: "Luis Gómez",
    cargo: "",
    email: "luis@barco.org",
    telefono: "3004445566",
    linkedin_url: "",
  }),
  contact({
    nombre: "Sin correo",
    email: "",
    telefono: "3000000000",
    empresa: "Fundación Barco S.A.S.",
  }),
  contact({
    nombre: "Elena Ruiz",
    empresa: "GE Vernova",
    email: "elena@ge.com",
    telefono: "+1 202 555 0100",
    cargo: "CTO",
  }),
  contact({
    nombre: "Otro",
    empresa: "GERS",
    email: "otro@gers.com",
    telefono: "3010000000",
    cargo: "Analista",
  }),
];

const sheet = documentMatrix(
  [
    headers,
    ["Fundación Barco", "", "", "", ""],
    ["GE Vernova", "", "", "", ""],
    ["GERS", "", "", "", ""],
    ["Jardín Botánico", "", "", "", ""],
    ["", "", "", "", ""],
  ],
  portfolio
);

const cases = [
  ["Barco contiene la razón social con S.A.S.", companiesMatch("Fundación Barco", "FUNDACIÓN BARCO S.A.S.")],
  ["GE no se confunde con GERS", companiesMatch("GE", "GERS") === false],
  ["GE sí contiene a GE Vernova", companiesMatch("GE Vernova", "GE Vernova Colombia")],
  ["dos contactos completos de Barco", sheet.rows.filter((row) => row[0] === "Fundación Barco").length === 2],
  ["el segundo contacto conserva el nombre del Excel", sheet.rows[1][0] === "Fundación Barco"],
  ["móvil y correo del primer contacto", sheet.rows[0][1] === "+57 300 111 2233" && sheet.rows[0][2] === "ana@barco.org"],
  ["cargo vacío queda sin dato", sheet.rows[1][3] === MISSING_FIELD],
  ["linkedin vacío queda sin dato", sheet.rows[1][4] === MISSING_FIELD],
  ["GE Vernova documentada", sheet.rows.some((row) => row[0] === "GE Vernova" && row[2] === "elena@ge.com")],
  ["GERS no hereda a GE", sheet.rows.find((row) => row[0] === "GERS")?.[2] === "otro@gers.com"],
  ["empresa ausente", sheet.rows.find((row) => row[0] === "Jardín Botánico")?.slice(1).every((cell) => cell === MISSING_COMPANY)],
  ["filas vacías no salen", sheet.stats.outputRows === 5],
  ["conteos", sheet.stats.found === 3 && sheet.stats.missing === 1 && sheet.stats.contactsWritten === 4],
];

let failed = 0;
for (const [name, ok] of cases) {
  if (ok) console.log(`  ✓ ${name}`);
  else {
    console.error(`  ✗ ${name}`);
    failed += 1;
  }
}

if (failed) {
  console.error(sheet.rows);
  console.error(`\n${failed} aserción(es) fallida(s).`);
  process.exit(1);
}
console.log("\nDocumentar Excel OK");
