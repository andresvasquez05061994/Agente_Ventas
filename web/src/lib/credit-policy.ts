/** Tope con el que empieza cada mes. Un ajuste en Configuración solo dura ese mes. */
export const DEFAULT_APOLLO_MONTHLY_BUDGET = 2500;

export const APOLLO_BUDGET_MIN = 1;
export const APOLLO_BUDGET_MAX = 1_000_000;

export type ApolloBudgetSource = "guardado" | "predeterminado";

/** No volver a pedir el mismo teléfono a Apollo durante este tiempo. */
export const PHONE_REQUEST_TTL_MS = 12 * 60 * 60 * 1000;

export const APOLLO_RATE_MAX = 30;
export const APOLLO_RATE_WINDOW_MS = 10 * 60 * 1000;

export const MISTRAL_RATE_MAX = 40;
export const MISTRAL_RATE_WINDOW_MS = 10 * 60 * 1000;

export const BUDGET_WARN_RATIO = 0.15;

export function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

/** Mes UTC, el mismo corte con el que se cuenta el consumo (`date_trunc` en la base). */
export function utcMonthKey(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function encodeMonthlyBudget(budget: number, now = new Date()): string {
  return `${utcMonthKey(now)}:${Math.floor(budget)}`;
}

/** Devuelve el tope solo si fue guardado para el mes UTC actual. Si no, el mes vuelve a 2500. */
export function decodeMonthlyBudget(
  raw: string | null | undefined,
  now = new Date()
): number | null {
  if (raw == null) return null;
  const match = /^(\d{4}-\d{2}):(\d+)$/.exec(String(raw).trim());
  if (!match || match[1] !== utcMonthKey(now)) return null;
  const amount = Number(match[2]);
  if (!Number.isFinite(amount) || amount < APOLLO_BUDGET_MIN || amount > APOLLO_BUDGET_MAX) {
    return null;
  }
  return amount;
}

/** El valor de este mes manda. Sin él, el tope es 2500 aunque Vercel tenga otra variable. */
export function resolveApolloMonthlyBudget(
  stored: number | null | undefined
): { budget: number; source: ApolloBudgetSource } {
  if (stored != null && Number.isFinite(stored) && stored >= APOLLO_BUDGET_MIN) {
    return {
      budget: Math.min(APOLLO_BUDGET_MAX, Math.floor(stored)),
      source: "guardado",
    };
  }
  return { budget: DEFAULT_APOLLO_MONTHLY_BUDGET, source: "predeterminado" };
}

/** Porcentaje usado este mes. Puede pasar de 100 si el consumo ya superó el tope. */
export function usagePercent(used: number, budget: number): number {
  if (!Number.isFinite(budget) || budget <= 0) return 0;
  const safeUsed = Number.isFinite(used) ? Math.max(0, used) : 0;
  return Math.round((safeUsed / budget) * 100);
}

export function remainingCredits(used: number, budget: number): number {
  return Math.max(0, budget - Math.max(0, used));
}

export function isBudgetWarning(used: number, budget: number, ratio = BUDGET_WARN_RATIO): boolean {
  if (budget <= 0) return false;
  return remainingCredits(used, budget) <= budget * ratio;
}

export function isPhoneRequestPending(
  requestedAt: Date | string | number | null | undefined,
  now = Date.now(),
  ttlMs = PHONE_REQUEST_TTL_MS
): boolean {
  if (requestedAt == null || requestedAt === "") return false;
  const t =
    typeof requestedAt === "number"
      ? requestedAt
      : requestedAt instanceof Date
        ? requestedAt.getTime()
        : new Date(requestedAt).getTime();
  if (!Number.isFinite(t)) return false;
  const age = now - t;
  return age >= 0 && age < ttlMs;
}
