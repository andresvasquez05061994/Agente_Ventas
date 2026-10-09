import { getApolloProspeccionCredits } from "./db";
import {
  APOLLO_RATE_MAX,
  APOLLO_RATE_WINDOW_MS,
  MISTRAL_RATE_MAX,
  MISTRAL_RATE_WINDOW_MS,
  apolloMonthlyBudget,
  remainingCredits,
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

const buckets = new Map<string, { count: number; resetAt: number }>();

export function consumeRateLimit(
  key: string,
  max: number,
  windowMs: number
): { ok: true } | { ok: false; retrySec: number } {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (current.count >= max) {
    return { ok: false, retrySec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { ok: true };
}

export function assertApolloRateLimit() {
  const hit = consumeRateLimit("apollo", APOLLO_RATE_MAX, APOLLO_RATE_WINDOW_MS);
  if (!hit.ok) {
    throw new UsageLimitError(
      `Demasiadas búsquedas Apollo seguidas. Espera ${hit.retrySec}s para no gastar créditos de más.`,
      "apollo_rate"
    );
  }
}

export function assertMistralRateLimit() {
  const hit = consumeRateLimit("mistral", MISTRAL_RATE_MAX, MISTRAL_RATE_WINDOW_MS);
  if (!hit.ok) {
    throw new UsageLimitError(
      `Límite de consultas IA alcanzado. Espera ${hit.retrySec}s e inténtalo de nuevo.`,
      "mistral_rate"
    );
  }
}

export async function assertApolloBudget(minRemaining = 1) {
  const snapshot = await getApolloBudgetSnapshot();
  if (snapshot.remaining < minRemaining) {
    throw new UsageLimitError(
      `Presupuesto mensual de Apollo agotado (${snapshot.used}/${snapshot.budget} créditos). ` +
        "Sube APOLLO_MONTHLY_CREDIT_BUDGET en Vercel o espera al próximo mes.",
      "apollo_budget"
    );
  }
  return snapshot;
}

export async function getApolloBudgetSnapshot() {
  const budget = apolloMonthlyBudget();
  const credits = await getApolloProspeccionCredits();
  const used = credits.credits_this_month;
  return {
    ...credits,
    monthly_budget: budget,
    remaining: remainingCredits(used, budget),
    used,
    budget,
  };
}
