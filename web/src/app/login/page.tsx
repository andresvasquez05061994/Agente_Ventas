import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { currentSessionStatus } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Acceso | Agente Ventas B2B",
  description: "Acceso privado del equipo IAC",
};

export default async function LoginPage() {
  const status = await currentSessionStatus();
  if (status === "ok") redirect("/resumen");
  return <LoginForm configured={status !== "misconfigured"} />;
}
