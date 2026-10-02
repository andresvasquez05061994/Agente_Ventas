import "server-only";

import { createRemoteJWKSet, jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { publicOrigin } from "./team-auth";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export function originFromRequest(req: NextRequest): string {
  return publicOrigin({
    forwardedHost: req.headers.get("x-forwarded-host"),
    host: req.headers.get("host"),
    forwardedProto: req.headers.get("x-forwarded-proto"),
    fallbackOrigin: req.nextUrl.origin,
  });
}

export function googleAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): URL {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", input.state);
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("include_granted_scopes", "true");
  return url;
}

export async function exchangeGoogleCode(input: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error("Intercambio de código Google rechazado");
  const data = (await res.json()) as { id_token?: unknown };
  if (typeof data.id_token !== "string" || !data.id_token) {
    throw new Error("Google no devolvió id_token");
  }
  return data.id_token;
}

export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string
): Promise<{ email?: unknown; email_verified?: unknown }> {
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
  });
  return { email: payload.email, email_verified: payload.email_verified };
}
