"use client";

import { useState, type FormEvent } from "react";
import { ActionBanner } from "@/components/ui";

export function LoginForm({ configured }: { configured: boolean }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "No se pudo iniciar sesión");
        setPending(false);
        return;
      }
      window.location.assign("/resumen");
    } catch {
      setError("Error de red al iniciar sesión");
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded border border-[#C8D0D8] bg-white p-6 dark:border-[#3D4D61] dark:bg-[#161D27]"
      >
        <div>
          <h1 className="page-title">Acceso del equipo</h1>
          <p className="page-subtitle">
            Agente Ventas es una app privada de IAC. Los leads y sus datos de contacto no son
            públicos.
          </p>
        </div>

        {!configured && (
          <ActionBanner
            tone="warning"
            title="Acceso sin configurar"
            message="Define AUTH_SECRET y TEAM_PASSWORD en Vercel (mínimo 32 y 12 caracteres) y vuelve a desplegar."
          />
        )}

        {error && <ActionBanner tone="error" title="Acceso denegado" message={error} />}

        <div>
          <label className="field-label" htmlFor="team-password">
            Contraseña del equipo
          </label>
          <input
            id="team-password"
            name="password"
            type="password"
            autoComplete="current-password"
            className="input-field"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={!configured || pending}
            required
            autoFocus
          />
        </div>

        <button type="submit" className="btn-primary w-full" disabled={!configured || pending}>
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
