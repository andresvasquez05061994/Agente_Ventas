/**
 * Enriquecer: detectar columnas, rellenar 1:1 y no inventar gente de la empresa.
 * npx tsx --tsconfig tsconfig.json scripts/test-excel-enrich.mjs
 */
import {
  applyPersonToRow,
  detectEnrichField,
  ensureFillColumns,
  parseEnrichMatrix,
  searchCompany,
  searchName,
  suggestedFill,
  suggestedSearchBy,
} from "../src/lib/excel-enrich.ts";

const cases = [];

function check(name, ok) {
  cases.push([name, ok]);
}

check("detecta Nombre", detectEnrichField("Nombre") === "nombre");
check("detecta Empresa", detectEnrichField("Empresa") === "empresa");
check("detecta Cargo", detectEnrichField("Cargo") === "cargo");
check("detecta Móvil", detectEnrichField("Móvil") === "telefono");
check("detecta Correo", detectEnrichField("Correo") === "email");
check("detecta LinkedIn", detectEnrichField("Perfil LinkedIn") === "linkedin");
check("detecta País", detectEnrichField("País") === "pais");

const parsed = parseEnrichMatrix([
  ["Nombre", "Cargo", "Empresa"],
  ["ANDRÉ CASTELO PICHEL", "Socio Director", "APDTIC - Profesionales del derecho TIC"],
  ["Iago Soto", "Founder and Sales Director", "Quobis"],
]);

check("dos filas de datos", parsed.rows.length === 2);
check("mapea nombre", parsed.columns.find((c) => c.field === "nombre")?.index === 0);
check("mapea cargo", parsed.columns.find((c) => c.field === "cargo")?.index === 1);
check("mapea empresa", parsed.columns.find((c) => c.field === "empresa")?.index === 2);
check(
  "buscar por nombre+empresa+cargo",
  JSON.stringify(suggestedSearchBy(parsed.columns)) === JSON.stringify(["nombre", "empresa", "cargo"])
);
check("nombre de la fila 1", searchName(parsed.rows[0], parsed.columns) === "ANDRÉ CASTELO PICHEL");
check("empresa de la fila 2", searchCompany(parsed.rows[1], parsed.columns).includes("Quobis"));

const prepared = ensureFillColumns(
  { ...parsed, fileLabel: "andicom.csv" },
  ["telefono", "email", "linkedin", "pais"]
);
check("añade Móvil", prepared.headers.includes("Móvil"));
check("añade Correo", prepared.headers.includes("Correo"));
check("añade LinkedIn", prepared.headers.includes("LinkedIn"));
check("añade País", prepared.headers.includes("País"));
check("no duplica Empresa", prepared.headers.filter((h) => h === "Empresa").length === 1);
check("misma cantidad de filas", prepared.rows.length === 2);

const person = {
  apollo_id: "1",
  nombre: "Andre Castelo Pichel",
  cargo: "Managing Partner",
  empresa: "APDTIC",
  email: "acastelo@apdtic.com",
  telefono: "+34881805020",
  pais: "Spain",
  linkedin_url: "https://linkedin.com/in/andre",
};
const filled = applyPersonToRow(prepared.rows[0], prepared.columns, suggestedFill().concat("linkedin", "pais"), person);
const emailCol = prepared.columns.find((c) => c.field === "email").index;
const phoneCol = prepared.columns.find((c) => c.field === "telefono").index;
const nameCol = prepared.columns.find((c) => c.field === "nombre").index;
const cargoCol = prepared.columns.find((c) => c.field === "cargo").index;
check("rellena correo", filled[emailCol] === "acastelo@apdtic.com");
check("rellena móvil", filled[phoneCol] === "+34881805020");
check("no pisa el nombre del archivo", filled[nameCol] === "ANDRÉ CASTELO PICHEL");
check("no pisa el cargo del archivo", filled[cargoCol] === "Socio Director");

const iago = {
  ...person,
  nombre: "Iago Soto",
  cargo: "Founder and Sales Director",
  empresa: "Quobis",
  email: "iago.soto@quobis.com",
  telefono: "+34902999465",
};
const iagoRow = applyPersonToRow(prepared.rows[1], prepared.columns, ["telefono", "email"], iago);
check("la fila de Iago se rellena con Iago, no con alguien de APDTIC", iagoRow[emailCol] === "iago.soto@quobis.com");
check("el nombre de Iago no cambia", searchName(iagoRow, prepared.columns) === "Iago Soto");

let failed = 0;
for (const [name, ok] of cases) {
  if (ok) console.log(`  ✓ ${name}`);
  else {
    console.error(`  ✗ ${name}`);
    failed += 1;
  }
}

if (failed) {
  console.error(parsed);
  console.error(`\n${failed} aserción(es) fallida(s).`);
  process.exit(1);
}
console.log("\nEnriquecer Excel OK");
