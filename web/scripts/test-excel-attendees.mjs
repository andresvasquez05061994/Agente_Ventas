/**
 * Listas de asistentes (Nombre, Cargo, Empresa) y documentar por persona.
 * node --experimental-strip-types scripts/test-excel-attendees.mjs
 */
import {
  MISSING_CONTACT,
  documentMatrix,
} from "../src/lib/excel-document.ts";
import {
  cleanPersonName,
  extractAttendees,
  isAttendeeMatrix,
  namesMatch,
  nameScore,
} from "../src/lib/excel-attendees.ts";

function contact(partial) {
  return {
    nombre: "Antonio Correa",
    cargo: "Country Manager Colombia",
    empresa: "CONCEPTO MOVIL SAS",
    email: "antonio@concepto.com",
    telefono: "+57 300 111 2233",
    pais: "Colombia",
    linkedin_url: "https://linkedin.com/in/antonio",
    lead_status: "Nuevo",
    ...partial,
  };
}

const cases = [];

function check(name, ok) {
  cases.push([name, ok]);
}

check("limpia tratamientos y recortes", cleanPersonName("Sr. WILSON OROZCO") === "WILSON OROZCO");
check(
  "quita el apellido recortado con puntos suspensivos",
  cleanPersonName("ANTONIO CORREA ARGUE…") === "ANTONIO CORREA"
);
check("quita credencial tras coma", cleanPersonName("INGRID GARZON, Ing.") === "INGRID GARZON");
check("mismo nombre pese a tildes", namesMatch("Martha Lucia Cepeda", "MARTHA LUCÍA CEPEDA M"));
check("no confunde nombres distintos", namesMatch("Antonio Correa", "Camila Lazaro") === false);
check("puntaje alto con apellido recortado", nameScore("ANTONIO CORREA", "Antonio Correa Arguello") >= 70);

const andicom = [
  ["Nombre", "Cargo", "Empresa"],
  ["ANDRÉ CASTELO PICHEL", "Socio Director", "APDTIC - Profesionales del derecho TIC"],
  ["ANTONIO CORREA ARGUE…", "Country Manager Colombia", "CONCEPTO MOVIL SAS"],
  ["", "", ""],
  ["ANTONIO CORREA ARGUE…", "Country Manager Colombia", "CONCEPTO MOVIL SAS"],
];

check("detecta lista de asistentes", isAttendeeMatrix(andicom) === true);
const extracted = extractAttendees(andicom);
check("dos filas iguales son una persona", extracted?.attendees.length === 2);
check("nombre recortado queda usable", extracted?.attendees[1]?.name === "ANTONIO CORREA");

const sheet = documentMatrix(andicom, [
  contact({}),
  contact({
    nombre: "Otra persona",
    empresa: "APDTIC",
    email: "otra@apdtic.com",
    telefono: "3009998877",
  }),
]);

check("modo asistente", sheet.mode === "attendee");
check("conserva las filas originales, incluso repetidas", sheet.rows.length === 3);
check(
  "rellena móvil y correo de Antonio",
  sheet.rows.some((row) => row.includes("antonio@concepto.com") && row.includes("+57 300 111 2233"))
);
check(
  "empresa sin esa persona no hereda otro contacto",
  sheet.rows[0].includes(MISSING_CONTACT) && !sheet.rows[0].includes("otra@apdtic.com")
);
check("no inventa empresas", sheet.stats.withContacts === 2 && sheet.stats.personMissing === 1);

const companiesOnly = documentMatrix(
  [
    ["Empresa", "Móvil", "Correo"],
    ["CONCEPTO MOVIL SAS", "", ""],
  ],
  [contact({})]
);
check("archivo solo de empresas sigue expandiendo contactos", companiesOnly.mode === "company");
check("empresa documentada con correo", companiesOnly.rows[0][2] === "antonio@concepto.com");

let failed = 0;
for (const [name, ok] of cases) {
  if (ok) console.log(`  ✓ ${name}`);
  else {
    console.error(`  ✗ ${name}`);
    failed += 1;
  }
}

if (failed) {
  console.error(extracted);
  console.error(sheet);
  console.error(`\n${failed} aserción(es) fallida(s).`);
  process.exit(1);
}
console.log("\nAsistentes Excel OK");
