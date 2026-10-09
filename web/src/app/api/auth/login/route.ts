import { NextRequest, NextResponse } from "next/server";
import {
  attachSessionCookie,
  clearLoginAttempts,
  clientIp,
  isAuthConfigured,
  loginRateLimited,
  safeNextPath,
  verifyPassword,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: "APP_PASSWORD no configurada en Vercel." },
      { status: 503 }
    );
  }

  const ip = clientIp(req);
  if (loginRateLimited(ip)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429 }
    );
  }

  let password = "";
  try {
    const body = (await req.json()) as { password?: string };
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  if (!verifyPassword(password)) {
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }

  clearLoginAttempts(ip);
  const next = safeNextPath(req.nextUrl.searchParams.get("next"));
  const res = NextResponse.json({ ok: true, next });
  return attachSessionCookie(res);
}
