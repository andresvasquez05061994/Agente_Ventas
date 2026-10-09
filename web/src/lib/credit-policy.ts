/** Tope mensual de créditos Apollo si no hay `APOLLO_MONTHLY_CREDIT_BUDGET`. */
export const DEFAULT_APOLLO_MONTHLY_BUDGET = 2500;

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

export function apolloMonthlyBudget(env = process.env.APOLLO_MONTHLY_CREDIT_BUDGET): number {
  return parsePositiveInt(env, DEFAULT_APOLLO_MONTHLY_BUDGET);
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
