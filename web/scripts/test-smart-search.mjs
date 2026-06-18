/**
 * Prueba local del intérprete de búsqueda inteligente (modo reglas, sin Mistral).
 * Uso: node scripts/test-smart-search.mjs
 */

const APOLLO_JOB_TITLES = [
  { label: "Director de TI / IT Director", value: "IT Director" },
  { label: "CTO", value: "CTO" },
  { label: "CIO", value: "CIO" },
  { label: "CEO", value: "CEO" },
];

function mapTitlesFromSuggestions(suggestions) {
  const matched = new Set();
  const tokens = suggestions.flatMap((s) => s.split(/[,;/|]+/).map((t) => t.trim())).filter(Boolean);
  for (const token of tokens) {
    const norm = token.toLowerCase();
    if (norm.includes("tecnolog") || norm.includes("sistemas") || (norm.includes("director") && /\bti\b/.test(norm))) {
      matched.add("IT Director");
      matched.add("Director of Technology");
      continue;
    }
    for (const t of APOLLO_JOB_TITLES) {
      const val = t.value.toLowerCase();
      const lab = t.label.toLowerCase();
      if (norm === val || norm === lab || lab.includes(norm) || norm.includes(val)) {
        matched.add(t.value);
      }
    }
    if (/(^|\s)cto(\s|$)/.test(norm) || norm === "cto") matched.add("CTO");
  }
  return [...matched];
}

const cases = [
  {
    q: "directores de tecnología en Colombia empresa Bancolombia",
    expectTitles: ["IT Director"],
  },
  {
    q: "CTO en software México",
    expectTitles: ["CTO"],
  },
];

let failed = 0;
for (const c of cases) {
  const titles = mapTitlesFromSuggestions([c.q]);
  const ok = c.expectTitles.every((t) => titles.includes(t));
  console.log(ok ? "OK" : "FAIL", "-", c.q, "→", titles.join(", "));
  if (!ok) failed++;
}

if (failed) {
  console.error(`\n${failed} prueba(s) fallida(s)`);
  process.exit(1);
}
console.log("\nTodas las pruebas de mapeo pasaron.");
