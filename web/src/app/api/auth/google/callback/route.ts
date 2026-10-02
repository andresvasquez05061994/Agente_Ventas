import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode, originFromRequest, verifyGoogleIdToken } from "@/lib/google-oauth";
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  assessGoogleProfile,
  authEnvFromProcess,
  isGoogleEnabled,
  readOAuthTransaction,
  secretMatches,
  sessionCookieOptions,
  signSession,
} from "@/lib/team-auth";

export const dynamic = "force-dynamic";

function loginRedirect(req: NextRequest, error: string, email?: string) {
  const back = new URL("/login", originFromRequest(req));
  back.searchParams.set("error", error);
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254) {
    back.searchParams.set("email", email);
  }
  const res = NextResponse.redirect(back);
  res.cookies.set(OAUTH_STATE_COOKIE, "", sessionCookieOptions(0));
  return res;
}

export async function GET(req: NextRequest) {
  const env = authEnvFromProcess();
  if (!isGoogleEnabled(env)) return loginRedirect(req, "oauth");

  const googleError = req.nextUrl.searchParams.get("error");
  if (googleError) {
    return loginRedirect(req, googleError === "access_denied" ? "google_denied" : "oauth");
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const transaction = readOAuthTransaction(req.cookies.get(OAUTH_STATE_COOKIE)?.value, env);
  if (!code || !state || !transaction || !secretMatches(state, transaction.state)) {
    return loginRedirect(req, "state");
  }

  try {
    const idToken = await exchangeGoogleCode({
      code,
      redirectUri: transaction.redirectUri,
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
    });
    const profile = await verifyGoogleIdToken(idToken, env.googleClientId);
    const decision = assessGoogleProfile(profile, env);
    if (!decision.ok) {
      const email = typeof profile.email === "string" ? profile.email : undefined;
      return loginRedirect(
        req,
        decision.reason === "not_allowed"
          ? "not_allowed"
          : decision.reason === "unverified"
            ? "unverified"
            : "oauth",
        decision.reason === "not_allowed" ? email : undefined
      );
    }

    const dest = new URL("/resumen", transaction.redirectUri);
    const res = NextResponse.redirect(dest);
    res.cookies.set(
      SESSION_COOKIE,
      signSession(env, Date.now(), { method: "google", email: decision.email }),
      sessionCookieOptions(SESSION_MAX_AGE_SEC)
    );
    res.cookies.set(OAUTH_STATE_COOKIE, "", sessionCookieOptions(0));
    return res;
  } catch {
    return loginRedirect(req, "oauth");
  }
}
