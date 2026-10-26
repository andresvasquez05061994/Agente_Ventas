import { consumeRateWindow, getApolloProspeccionCredits, getStoredApolloMonthlyBudget } from "./db";
import {
  APOLLO_RATE_MAX,
  APOLLO_RATE_WINDOW_MS,
  MISTRAL_RATE_MAX,
  MISTRAL_RATE_WINDOW_MS,
  remainingCredits,
  resolveApolloMonthlyBudget,
  usagePercent,
} from "./credit-policy";

export class UsageLimitError extends Error {
  readonly status = 429;
  readonly code: "apollo_budget" | "apollo_rate" | "mistral_rate";

  constructor(message: string, code: UsageLimitError["code"]) {
    super(message);
    this.name = "UsageLimitError";
    this.code = code;
  }
}

async function assertStoredRateLimit(
  key: string,
  max: number,
  windowMs: number,
  message: (retrySec: number) => string,
  code: UsageLimitError["code"]
) {
  const hit = await consumeRateWindow(key, max, windowMs);
  if (hit.limited) throw new UsageLimitError(message(hit.retrySec), code);
}

export async function assertApolloRateLimit(userId: number) {
  await assertStoredRateLimit(
    `apollo:user:${userId}`,
    APOLLO_RATE_MAX,
    APOLLO_RATE_WINDOW_MS,
    (retrySec) =>
      `Demasiadas búsquedas Apollo seguidas. Espera ${retrySec}s para no gastar créditos de más.`,
    "apollo_rate"
  );
}

export async function assertMistralRateLimit(userId: number) {
  await assertStoredRateLimit(
    `mistral:user:${userId}`,
    MISTRAL_RATE_MAX,
    MISTRAL_RATE_WINDOW_MS,
    (retrySec) => `Límite de consultas IA alcanzado. Espera ${retrySec}s e inténtalo de nuevo.`,
    "mistral_rate"
  );
}

export async function assertApolloBudget(userId: number, minRemaining = 1) {
  const snapshot = await getApolloBudgetSnapshot(userId);
  if (snapshot.remaining < minRemaining) {
    throw new UsageLimitError(
      `Presupuesto mensual de Apollo agotado (${snapshot.used}/${snapshot.budget} créditos). ` +
        "Súbelo en Configuración para este mes, o espera al día 1: el tope vuelve a 2.500 y el consumo empieza de cero.",
      "apollo_budget"
    );
  }
  return snapshot;
}

export async function getApolloBudgetSnapshot(userId: number) {
  const stored = await getStoredApolloMonthlyBudget(userId);
  const resolved = resolveApolloMonthlyBudget(stored);
  const credits = await getApolloProspeccionCredits(userId);
  const used = credits.credits_this_month;
  const budget = resolved.budget;
  return {
    ...credits,
    monthly_budget: budget,
    budget_source: resolved.source,
    used_percent: usagePercent(used, budget),
    remaining: remainingCredits(used, budget),
    used,
    budget,
  };
}
