import { NextRequest, NextResponse } from "next/server";
import {
  attachSessionCookie,
  clearLoginAttempts,
  clientIp,
  isAuthConfigured,
  loginRateLimited,
  safeNextPath,
} from "@/lib/auth";
import { ensureDb } from "@/lib/db";
import { getUserByEmail, verifyPasswordHash } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: "Falta ADMIN_EMAIL en el servidor." },
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

  let email = "";
  let password = "";
  try {
    const body = (await req.json()) as { email?: string; password?: string };
    email = String(body.email ?? "");
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  let user;
  try {
    await ensureDb();
    user = await getUserByEmail(email);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo preparar el acceso";
    return NextResponse.json({ error: msg.slice(0, 300) }, { status: 500 });
  }
  if (!user || !verifyPasswordHash(password, user.password_hash)) {
    return NextResponse.json({ error: "Correo o contraseña incorrectos." }, { status: 401 });
  }
  if (user.status === "pending") {
    return NextResponse.json(
      { error: "Tu cuenta está pendiente de aprobación." },
      { status: 403 }
    );
  }
  if (user.status === "rejected") {
    return NextResponse.json({ error: "Tu solicitud no fue aprobada." }, { status: 403 });
  }
  if (user.status === "disabled") {
    return NextResponse.json({ error: "Tu acceso fue dado de baja." }, { status: 403 });
  }

  clearLoginAttempts(ip);
  const next = safeNextPath(req.nextUrl.searchParams.get("next"));
  const res = NextResponse.json({ ok: true, next });
  return attachSessionCookie(res, user.id);
}
