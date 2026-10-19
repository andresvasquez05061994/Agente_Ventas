/**
 * Contrato del Sprint 3: tope de créditos y TTL de teléfono.
 * node scripts/test-credit-policy.mjs
 */

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function utcMonthKey(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function encodeMonthlyBudget(budget, now = new Date()) {
  return `${utcMonthKey(now)}:${Math.floor(budget)}`;
}

function decodeMonthlyBudget(raw, now = new Date()) {
  if (raw == null) return null;
  const match = /^(\d{4}-\d{2}):(\d+)$/.exec(String(raw).trim());
  if (!match || match[1] !== utcMonthKey(now)) return null;
  const amount = Number(match[2]);
  if (!Number.isFinite(amount) || amount < 1 || amount > 1_000_000) return null;
  return amount;
}

function resolveApolloMonthlyBudget(stored) {
  if (stored != null && Number.isFinite(stored) && stored >= 1) {
    return { budget: Math.min(1_000_000, Math.floor(stored)), source: "guardado" };
  }
  return { budget: 2500, source: "predeterminado" };
}

function usagePercent(used, budget) {
  if (!Number.isFinite(budget) || budget <= 0) return 0;
  const safeUsed = Number.isFinite(used) ? Math.max(0, used) : 0;
  return Math.round((safeUsed / budget) * 100);
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

const now = new Date("2026-10-19T12:00:00Z");
const nextMonth = new Date("2026-11-01T00:00:00Z");

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
  ["porcentaje a la mitad", usagePercent(1250, 2500) === 50],
  ["porcentaje puede superar 100", usagePercent(3000, 2500) === 120],
  ["porcentaje sin tope", usagePercent(10, 0) === 0],
  ["ajuste del mes en curso", decodeMonthlyBudget(encodeMonthlyBudget(4000, now), now) === 4000],
  ["el mes siguiente vuelve a vacío", decodeMonthlyBudget("2026-10:4000", nextMonth) === null],
  ["un mes viejo no sigue vigente", decodeMonthlyBudget("2026-09:9000", now) === null],
  ["un número suelto no cuenta como tope", decodeMonthlyBudget("5000", now) === null],
  ["sin ajuste de este mes el tope es 2500", resolveApolloMonthlyBudget(decodeMonthlyBudget("2026-09:9000", now)).budget === 2500],
  ["el ajuste de este mes manda", resolveApolloMonthlyBudget(4000).budget === 4000],
  ["corte UTC del día 1", utcMonthKey(new Date("2026-11-01T00:00:00Z")) === "2026-11"],
  ["todavía octubre justo antes del corte", utcMonthKey(new Date("2026-10-31T23:59:00Z")) === "2026-10"],
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
