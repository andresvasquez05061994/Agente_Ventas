import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { currentSessionStatus } from "@/lib/session";
import {
  authEnvFromProcess,
  isGoogleEnabled,
  isPasswordEnabled,
  loginErrorMessage,
} from "@/lib/team-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Acceso | Agente Ventas B2B",
  description: "Acceso privado del equipo IAC",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string }>;
}) {
  const status = await currentSessionStatus();
  if (status === "ok") redirect("/resumen");

  const params = await searchParams;
  const env = authEnvFromProcess();
  const passwordEnabled = isPasswordEnabled(env);
  const googleEnabled = isGoogleEnabled(env);
  const allowlistReady = env.allowedEmails.length > 0 || env.allowedDomains.length > 0;
  const oauthError = loginErrorMessage(params.error, params.email);

  let banner: { tone: "warning" | "error"; title: string; message: string } | null = null;
  if (status === "misconfigured") {
    banner = {
      tone: "warning",
      title: "Acceso sin configurar",
      message:
        "Define AUTH_SECRET (mínimo 32 caracteres) y al menos un acceso: Google (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y la lista de correos) o TEAM_PASSWORD. Luego vuelve a desplegar.",
    };
  } else if (googleEnabled && !allowlistReady) {
    banner = {
      tone: "warning",
      title: "Lista de correos vacía",
      message:
        "Google está activo, pero falta ALLOWED_EMAILS o ALLOWED_EMAIL_DOMAINS. Ninguna cuenta de Google podrá entrar hasta que las definas.",
    };
  } else if (oauthError) {
    banner = { tone: "error", title: "Acceso denegado", message: oauthError };
  }

  return (
    <LoginForm passwordEnabled={passwordEnabled} googleEnabled={googleEnabled} banner={banner} />
  );
}
