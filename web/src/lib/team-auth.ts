import { createHash, createHmac, scryptSync, timingSafeEqual } from "node:crypto";

/** Cookie de sesión del equipo. No contiene la contraseña. */
export const SESSION_COOKIE = "av_session";

/** 7 días. */
export const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;

const SESSION_VERSION = 1;
const MIN_AUTH_SECRET = 32;
const MIN_TEAM_PASSWORD = 12;

export type AuthEnv = {
  authSecret: string;
  teamPassword: string;
};

export type SessionStatus = "ok" | "unauthenticated" | "misconfigured";

export function authEnvFromProcess(env: NodeJS.ProcessEnv = process.env): AuthEnv {
  return {
    authSecret: env.AUTH_SECRET?.trim() ?? "",
    teamPassword: env.TEAM_PASSWORD?.trim() ?? "",
  };
}

export function isAuthConfigured(env: AuthEnv): boolean {
  return env.authSecret.length >= MIN_AUTH_SECRET && env.teamPassword.length >= MIN_TEAM_PASSWORD;
}

/**
 * Compara secretos de alta entropía (tokens de webhook) sin filtrar la longitud.
 * No usar para la contraseña del equipo: esa pasa por scrypt en `passwordMatches`.
 */
export function secretMatches(provided: string, expected: string): boolean {
  if (provided.length > 4096 || expected.length > 4096) {
    const dummy = createHash("sha256").update("").digest();
    timingSafeEqual(dummy, dummy);
    return false;
  }
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

/** Comparación lenta de la contraseña compartida. Solo en el login. */
export function passwordMatches(provided: string, expected: string): boolean {
  const salt = "agente-ventas-team-password-v1";
  const tooLong = provided.length > 256 || expected.length > 256;
  const a = scryptSync(tooLong || !provided ? "\0" : provided, salt, 32);
  const b = scryptSync(tooLong || !expected ? "\0" : expected, salt, 32);
  const equal = timingSafeEqual(a, b);
  if (tooLong || !provided || !expected) return false;
  return equal;
}

function passwordTag(password: string): string {
  return createHash("sha256").update(`av-session-v1:${password}`, "utf8").digest("hex");
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

export function signSession(env: AuthEnv, now = Date.now()): string {
  if (!isAuthConfigured(env)) {
    throw new Error("Autenticación no configurada");
  }
  const body = Buffer.from(
    JSON.stringify({
      v: SESSION_VERSION,
      exp: now + SESSION_MAX_AGE_SEC * 1000,
      pwd: passwordTag(env.teamPassword),
    }),
    "utf8"
  ).toString("base64url");
  return `${body}.${signPayload(body, env.authSecret)}`;
}

export function sessionStatus(
  token: string | null | undefined,
  env: AuthEnv,
  now = Date.now()
): SessionStatus {
  if (!isAuthConfigured(env)) return "misconfigured";
  if (!token || token.length > 4096) return "unauthenticated";

  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return "unauthenticated";
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = signPayload(body, env.authSecret);
  if (!secretMatches(sig, expected)) return "unauthenticated";

  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      v?: unknown;
      exp?: unknown;
      pwd?: unknown;
    };
    if (data.v !== SESSION_VERSION) return "unauthenticated";
    if (typeof data.exp !== "number" || !Number.isFinite(data.exp) || data.exp <= now) {
      return "unauthenticated";
    }
    if (typeof data.pwd !== "string" || !secretMatches(data.pwd, passwordTag(env.teamPassword))) {
      return "unauthenticated";
    }
    return "ok";
  } catch {
    return "unauthenticated";
  }
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
