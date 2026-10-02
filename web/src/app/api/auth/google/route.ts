import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { googleAuthorizationUrl, originFromRequest } from "@/lib/google-oauth";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_SEC,
  authEnvFromProcess,
  isAllowedGoogleRedirect,
  isGoogleEnabled,
  sessionCookieOptions,
  signOAuthTransaction,
} from "@/lib/team-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const env = authEnvFromProcess();
  if (!isGoogleEnabled(env)) {
    return NextResponse.json({ error: "Acceso con Google no configurado" }, { status: 404 });
  }

  const redirectUri = `${originFromRequest(req)}/api/auth/google/callback`;
  if (!isAllowedGoogleRedirect(redirectUri)) {
    return NextResponse.json({ error: "Origen no permitido para Google" }, { status: 400 });
  }

  const state = randomBytes(32).toString("base64url");
  const res = NextResponse.redirect(
    googleAuthorizationUrl({ clientId: env.googleClientId, redirectUri, state })
  );
  res.cookies.set(
    OAUTH_STATE_COOKIE,
    signOAuthTransaction(env, state, redirectUri),
    sessionCookieOptions(OAUTH_STATE_MAX_AGE_SEC)
  );
  return res;
}
