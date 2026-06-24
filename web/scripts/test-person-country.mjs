/**
 * Prueba filtro de país en perfiles Apollo.
 * Uso: node scripts/test-person-country.mjs
 */
import { personMatchesCountry } from "../src/lib/apollo-filters.ts";

const cases = [
  [{}, "Colombia", true, "sin ubicación → confía en Apollo"],
  [{ country: "Colombia" }, "Colombia", true, "country Colombia"],
  [{ city: "Medellín", state: "Antioquia" }, "Colombia", true, "ciudad colombiana"],
  [{ present_raw_address: "Mexico City, Mexico" }, "Colombia", false, "México explícito"],
  [{ country: "United States", city: "Austin" }, "Colombia", false, "EE.UU. explícito"],
  [{ city: "Bogotá" }, "Colombia", true, "solo Bogotá"],
  [{ organization: { country: "Colombia" } }, "Colombia", true, "org en Colombia"],
];

let failed = 0;
for (const [raw, country, expect, label] of cases) {
  const ok = personMatchesCountry(raw, country) === expect;
  console.log(ok ? "OK" : "FAIL", label);
  if (!ok) failed++;
}

if (failed) {
  console.error(`\n${failed} prueba(s) fallida(s)`);
  process.exit(1);
}
console.log("\nTodas las pruebas de país pasaron.");
