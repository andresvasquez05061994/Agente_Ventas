/**
 * Prueba coincidencia de nombres de empresa.
 * Uso: node scripts/test-organization-match.mjs
 */

function normalizeOrgName(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function organizationMatches(company, filter) {
  const f = normalizeOrgName(filter);
  if (!f) return true;
  const c = normalizeOrgName(company ?? "");
  if (!c) return false;
  if (c.includes(f) || f.includes(c)) return true;
  const tokens = f.split(" ").filter((t) => t.length >= 3);
  if (!tokens.length) return c.includes(f);
  return tokens.every((t) => c.includes(t));
}

const cases = [
  ["Ziklo Solar", "Ziklo", true],
  ["Seguros Sura", "Sura", true],
  ["Bancolombia S.A.", "Bancolombia", true],
  ["Supportical", "Ziklo", false],
];

let failed = 0;
for (const [company, filter, expect] of cases) {
  const ok = organizationMatches(company, filter) === expect;
  console.log(ok ? "OK" : "FAIL", `${filter} vs ${company} → ${organizationMatches(company, filter)}`);
  if (!ok) failed++;
}

if (failed) process.exit(1);
console.log("\nTodas las pruebas de empresa pasaron.");
