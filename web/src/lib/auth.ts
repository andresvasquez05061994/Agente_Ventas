import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { WIPE_CONFIRM_PHRASE } from "./auth-constants";

export { WIPE_CONFIRM_PHRASE };
export const SESSION_COOKIE = "iac_session";

const SESSION_TTL_SEC = 60 * 60 * 24 * 7;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export function isAuthRequired(): boolean {
  if (process.env.APP_PASSWORD?.trim()) return true;
  return process.env.VERCEL === "1";
}

export function isAuthConfigured(): boolean {
  return Boolean(process.env.APP_PASSWORD?.trim());
}

function signingSecret(): string {
  return process.env.AUTH_SECRET?.trim() || process.env.APP_PASSWORD?.trim() || "";
}

export function webhookToken(kind: "apollo" | "whatsapp"): string {
  const explicit =
    kind === "apollo"
      ? process.env.APOLLO_WEBHOOK_SECRET?.trim()
      : process.env.WHATSAPP_WEBHOOK_SECRET?.trim() || process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (explicit) return explicit;
  const root = signingSecret();
  if (!root) return "";
  return createHmac("sha256", root).update(`webhook:${kind}`).digest("hex");
}

function hmac(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export function createSessionValue(): string | null {
  const secret = signingSecret();
  if (!secret) return null;
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  return `${exp}.${hmac(`v1:${exp}`, secret)}`;
}

export function verifySessionValue(value: string | undefined | null): boolean {
  if (!value) return false;
  const secret = signingSecret();
  if (!secret) return false;
  const [expRaw, sig] = value.split(".");
  const exp = Number(expRaw);
  if (!expRaw || !sig || !Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  return timingSafeStringEqual(sig, hmac(`v1:${exp}`, secret));
}

export function hasSession(req: NextRequest): boolean {
  return verifySessionValue(req.cookies.get(SESSION_COOKIE)?.value);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.VERCEL === "1" || process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SEC,
  };
}

export function attachSessionCookie(res: NextResponse): NextResponse {
  const value = createSessionValue();
  if (!value) return res;
  res.cookies.set(SESSION_COOKIE, value, sessionCookieOptions());
  return res;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}

export function verifyPassword(password: string): boolean {
  const expected = process.env.APP_PASSWORD ?? "";
  if (!expected) return false;
  return timingSafeStringEqual(password, expected);
}

export function verifyWebhookToken(kind: "apollo" | "whatsapp", provided: string | null | undefined): boolean {
  const expected = webhookToken(kind);
  if (!expected || !provided) return false;
  return timingSafeStringEqual(provided, expected);
}

function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

export function requestProvidesWebhookToken(req: NextRequest, kind: "apollo" | "whatsapp"): boolean {
  const parts = req.nextUrl.pathname.split("/").filter(Boolean);
  const apolloPathToken =
    kind === "apollo" && parts[0] === "api" && parts[1] === "apollo" && parts[2] === "phone-webhook"
      ? parts[3]
      : null;
  const candidates = [
    apolloPathToken,
    req.nextUrl.searchParams.get("token"),
    req.nextUrl.searchParams.get("secret"),
    req.nextUrl.searchParams.get("hub.verify_token"),
    req.headers.get("x-webhook-secret"),
    req.headers.get("x-apollo-webhook-secret"),
    bearerToken(req),
  ];
  return candidates.some((value) => verifyWebhookToken(kind, value));
}

export function unauthorizedJson(): NextResponse {
  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}

export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "local";
}

export function loginRateLimited(ip: string): boolean {
  const now = Date.now();
  const current = loginAttempts.get(ip);
  if (!current || current.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > LOGIN_MAX_ATTEMPTS;
}

export function clearLoginAttempts(ip: string) {
  loginAttempts.delete(ip);
}

export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/resumen";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://")) return "/resumen";
  if (value.startsWith("/login") || value.startsWith("/api/")) return "/resumen";
  return value;
}
