/**
 * Contrato del Sprint 3: tope de créditos y TTL de teléfono.
 * node scripts/test-credit-policy.mjs
 */

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function remainingCredits(used, budget) {
  return Math.max(0, budget - Math.max(0, used));
}

function isBudgetWarning(used, budget, ratio = 0.15) {
  if (budget <= 0) return false;
  return remainingCredits(used, budget) <= budget * ratio;
}

function isPhoneRequestPending(requestedAt, now = Date.now(), ttlMs = 12 * 60 * 60 * 1000) {
  if (requestedAt == null || requestedAt === "") return false;
  const t = typeof requestedAt === "number" ? requestedAt : new Date(requestedAt).getTime();
  if (!Number.isFinite(t)) return false;
  const age = now - t;
  return age >= 0 && age < ttlMs;
}

const cases = [
  ["tope por defecto", parsePositiveInt(undefined, 2500) === 2500],
  ["tope inválido cae al default", parsePositiveInt("abc", 2500) === 2500],
  ["tope env válido", parsePositiveInt("1800", 2500) === 1800],
  ["créditos restantes", remainingCredits(400, 2500) === 2100],
  ["no negativos", remainingCredits(3000, 2500) === 0],
  ["alerta al 15%", isBudgetWarning(2130, 2500) === true],
  ["sin alerta con holgura", isBudgetWarning(100, 2500) === false],
  ["teléfono pendiente fresco", isPhoneRequestPending(Date.now() - 60_000) === true],
  ["teléfono vencido se puede pedir otra vez", isPhoneRequestPending(Date.now() - 13 * 60 * 60 * 1000) === false],
  ["sin solicitud previa", isPhoneRequestPending(null) === false],
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
  console.error(`\n${failed} aserción(es) fallida(s).`);
  process.exit(1);
}
console.log("\nPolítica de créditos OK");
