import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  authEnvFromProcess,
  sessionStatus,
  type SessionStatus,
} from "./team-auth";

export const currentSessionStatus = cache(async (): Promise<SessionStatus> => {
  const jar = await cookies();
  return sessionStatus(jar.get(SESSION_COOKIE)?.value, authEnvFromProcess());
});

/** Barrera real de las rutas de datos. Null si la sesión es válida. */
export async function requireTeamApi(): Promise<NextResponse | null> {
  const status = await currentSessionStatus();
  if (status === "ok") return null;
  if (status === "misconfigured") {
    return NextResponse.json(
      { error: "Autenticación no configurada en el servidor" },
      { status: 503 }
    );
  }
  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}
