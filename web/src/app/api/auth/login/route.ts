import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  authEnvFromProcess,
  isAuthConfigured,
  isPasswordEnabled,
  passwordMatches,
  sessionCookieOptions,
  signSession,
} from "@/lib/team-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const env = authEnvFromProcess();
  if (!isAuthConfigured(env)) {
    return NextResponse.json(
      { error: "Autenticación no configurada en el servidor" },
      { status: 503 }
    );
  }
  if (!isPasswordEnabled(env)) {
    return NextResponse.json({ error: "El acceso por contraseña no está activo" }, { status: 403 });
  }

  let password = "";
  try {
    const body = (await req.json()) as { password?: unknown };
    if (typeof body.password === "string") password = body.password.trim();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!passwordMatches(password, env.teamPassword)) {
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, signSession(env), sessionCookieOptions(SESSION_MAX_AGE_SEC));
  return res;
}
