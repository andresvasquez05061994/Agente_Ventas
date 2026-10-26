import { NextRequest, NextResponse } from "next/server";
import { clientIp, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS, loginRateKey } from "@/lib/auth";
import { consumeRateWindow, ensureDb } from "@/lib/db";
import { registerUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  try {
    await ensureDb();
    const gate = await consumeRateWindow(loginRateKey(ip), LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
    if (gate.limited) {
      return NextResponse.json(
        { error: `Demasiados intentos. Espera ${gate.retrySec}s.` },
        { status: 429 }
      );
    }
    const body = (await req.json()) as { email?: string; password?: string };
    const user = await registerUser(String(body.email ?? ""), String(body.password ?? ""));
    return NextResponse.json({
      ok: true,
      email: user.email,
      message: "Solicitud enviada. Podrás entrar cuando el administrador la apruebe.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo crear la cuenta";
    const status = /ya está registrado|correo válido|8 caracteres/.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
