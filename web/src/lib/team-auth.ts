import { createHash, createHmac, scryptSync, timingSafeEqual } from "node:crypto";

/** Cookie de sesión del equipo. No contiene la contraseña. */
export const SESSION_COOKIE = "av_session";

/** Cookie efímera del intercambio OAuth (state + redirect_uri firmados). */
export const OAUTH_STATE_COOKIE = "av_oauth_state";

/** 7 días. */
export const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;

/** 10 minutos para completar el redirect de Google. */
export const OAUTH_STATE_MAX_AGE_SEC = 10 * 60;

const SESSION_VERSION = 1;
const MIN_AUTH_SECRET = 32;
const MIN_TEAM_PASSWORD = 12;
const MIN_GOOGLE_CLIENT = 10;

export type AuthEnv = {
  authSecret: string;
  teamPassword: string;
  googleClientId: string;
  googleClientSecret: string;
  allowedEmails: string[];
  allowedDomains: string[];
};

export type SessionStatus = "ok" | "unauthenticated" | "misconfigured";

export type GoogleClaim = { method: "google"; email: string };

export type GoogleProfileDecision =
  | { ok: true; email: string }
  | { ok: false; reason: "missing_email" | "unverified" | "not_allowed" };

export function parseAllowList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,;\s]+/)
    .map((item) => item.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function authEnvFromProcess(env: NodeJS.ProcessEnv = process.env): AuthEnv {
  return {
    authSecret: env.AUTH_SECRET?.trim() ?? "",
    teamPassword: env.TEAM_PASSWORD?.trim() ?? "",
    googleClientId: env.GOOGLE_CLIENT_ID?.trim() ?? "",
    googleClientSecret: env.GOOGLE_CLIENT_SECRET?.trim() ?? "",
    allowedEmails: parseAllowList(env.ALLOWED_EMAILS),
    allowedDomains: parseAllowList(env.ALLOWED_EMAIL_DOMAINS),
  };
}

export function isPasswordEnabled(env: AuthEnv): boolean {
  return env.teamPassword.length >= MIN_TEAM_PASSWORD;
}

export function isGoogleEnabled(env: AuthEnv): boolean {
  return (
    env.googleClientId.length >= MIN_GOOGLE_CLIENT &&
    env.googleClientSecret.length >= MIN_GOOGLE_CLIENT
  );
}

export function isAuthConfigured(env: AuthEnv): boolean {
  return env.authSecret.length >= MIN_AUTH_SECRET && (isPasswordEnabled(env) || isGoogleEnabled(env));
}

export function emailAllowed(email: string, env: AuthEnv): boolean {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return false;
  if (env.allowedEmails.length === 0 && env.allowedDomains.length === 0) return false;
  if (env.allowedEmails.includes(normalized)) return true;
  return env.allowedDomains.includes(normalized.slice(at + 1));
}

export function assessGoogleProfile(
  profile: { email?: unknown; email_verified?: unknown },
  env: AuthEnv
): GoogleProfileDecision {
  if (typeof profile.email !== "string") return { ok: false, reason: "missing_email" };
  const email = profile.email.trim().toLowerCase();
  if (!email.includes("@")) return { ok: false, reason: "missing_email" };
  const verified = profile.email_verified === true || profile.email_verified === "true";
  if (!verified) return { ok: false, reason: "unverified" };
  if (!emailAllowed(email, env)) return { ok: false, reason: "not_allowed" };
  return { ok: true, email };
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

/** Comparación lenta de la contraseña compartida. Solo en el login por contraseña. */
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

function encodeSigned(payload: unknown, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${signPayload(body, secret)}`;
}

function readSigned(token: string | null | undefined, secret: string): unknown | null {
  if (!token || token.length > 4096) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!secretMatches(sig, signPayload(body, secret))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

export function signSession(env: AuthEnv, now = Date.now(), claim?: GoogleClaim): string {
  if (env.authSecret.length < MIN_AUTH_SECRET) {
    throw new Error("Autenticación no configurada");
  }
  const exp = now + SESSION_MAX_AGE_SEC * 1000;
  if (claim?.method === "google") {
    if (!isGoogleEnabled(env)) throw new Error("Google no configurado");
    const email = claim.email.trim().toLowerCase();
    if (!emailAllowed(email, env)) throw new Error("Correo no autorizado");
    return encodeSigned({ v: SESSION_VERSION, exp, method: "google", email }, env.authSecret);
  }
  if (!isPasswordEnabled(env)) throw new Error("Contraseña no configurada");
  return encodeSigned(
    { v: SESSION_VERSION, exp, method: "password", pwd: passwordTag(env.teamPassword) },
    env.authSecret
  );
}

export function sessionStatus(
  token: string | null | undefined,
  env: AuthEnv,
  now = Date.now()
): SessionStatus {
  if (!isAuthConfigured(env)) return "misconfigured";
  const data = readSigned(token, env.authSecret) as {
    v?: unknown;
    exp?: unknown;
    pwd?: unknown;
    method?: unknown;
    email?: unknown;
  } | null;
  if (!data) return "unauthenticated";
  if (data.v !== SESSION_VERSION) return "unauthenticated";
  if (typeof data.exp !== "number" || !Number.isFinite(data.exp) || data.exp <= now) {
    return "unauthenticated";
  }

  if (data.method === "google") {
    if (!isGoogleEnabled(env)) return "unauthenticated";
    if (typeof data.email !== "string" || !emailAllowed(data.email, env)) return "unauthenticated";
    return "ok";
  }

  if (data.method !== undefined && data.method !== "password") return "unauthenticated";
  if (!isPasswordEnabled(env)) return "unauthenticated";
  if (typeof data.pwd !== "string" || !secretMatches(data.pwd, passwordTag(env.teamPassword))) {
    return "unauthenticated";
  }
  return "ok";
}

/** Solo el callback de esta app, en https o en localhost. */
export function isAllowedGoogleRedirect(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (url.pathname !== "/api/auth/google/callback" || url.search || url.hash) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

export function signOAuthTransaction(
  env: AuthEnv,
  state: string,
  redirectUri: string,
  now = Date.now()
): string {
  if (env.authSecret.length < MIN_AUTH_SECRET || !isGoogleEnabled(env)) {
    throw new Error("Google no configurado");
  }
  if (!state || state.length > 256 || !isAllowedGoogleRedirect(redirectUri)) {
    throw new Error("Redirect no permitido");
  }
  return encodeSigned(
    { v: 1, exp: now + OAUTH_STATE_MAX_AGE_SEC * 1000, state, redirectUri },
    env.authSecret
  );
}

export function readOAuthTransaction(
  token: string | null | undefined,
  env: AuthEnv,
  now = Date.now()
): { state: string; redirectUri: string } | null {
  if (env.authSecret.length < MIN_AUTH_SECRET) return null;
  const data = readSigned(token, env.authSecret) as {
    v?: unknown;
    exp?: unknown;
    state?: unknown;
    redirectUri?: unknown;
  } | null;
  if (!data || data.v !== 1) return null;
  if (typeof data.exp !== "number" || !Number.isFinite(data.exp) || data.exp <= now) return null;
  if (typeof data.state !== "string" || typeof data.redirectUri !== "string") return null;
  if (!isAllowedGoogleRedirect(data.redirectUri)) return null;
  return { state: data.state, redirectUri: data.redirectUri };
}

export function publicOrigin(input: {
  forwardedHost: string | null;
  host: string | null;
  forwardedProto: string | null;
  fallbackOrigin: string;
}): string {
  const host = (input.forwardedHost ?? input.host ?? "").split(",")[0]?.trim() ?? "";
  const proto = (input.forwardedProto ?? "").split(",")[0]?.trim();
  const fallback = new URL(input.fallbackOrigin);
  const scheme = proto || fallback.protocol.replace(":", "");
  if (!host || !/^[\w.-]+(?::\d+)?$/.test(host)) return fallback.origin;
  if (scheme !== "http" && scheme !== "https") return fallback.origin;
  return `${scheme}://${host}`;
}

export function loginErrorMessage(error: string | undefined, email: string | undefined): string | null {
  const safeEmail =
    email && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  switch (error) {
    case "not_allowed":
      return safeEmail
        ? `La cuenta ${safeEmail} no está autorizada. Solo pueden entrar los correos o dominios de la lista del equipo.`
        : "Esa cuenta de Google no está autorizada. Solo pueden entrar los correos o dominios de la lista del equipo.";
    case "unverified":
      return "Google no ha verificado el correo de esa cuenta.";
    case "google_denied":
      return "Se canceló el acceso con Google.";
    case "state":
      return "El intento de acceso con Google caducó. Vuelve a intentarlo.";
    case "oauth":
      return "No se pudo completar el acceso con Google.";
    default:
      return null;
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
