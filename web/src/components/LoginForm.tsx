"use client";

import { useState, type FormEvent } from "react";
import { ActionBanner, type FeedbackTone } from "@/components/ui";

export function LoginForm({
  passwordEnabled,
  googleEnabled,
  banner,
}: {
  passwordEnabled: boolean;
  googleEnabled: boolean;
  banner: { tone: FeedbackTone; title: string; message: string } | null;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordEnabled || pending) return;
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
      <div className="w-full max-w-sm space-y-4 rounded border border-[#C8D0D8] bg-white p-6 dark:border-[#3D4D61] dark:bg-[#161D27]">
        <div>
          <h1 className="page-title">Acceso del equipo</h1>
          <p className="page-subtitle">
            Agente Ventas es una app privada de IAC. Los leads y sus datos de contacto no son
            públicos.
          </p>
        </div>

        {banner && <ActionBanner tone={banner.tone} title={banner.title} message={banner.message} />}
        {error && <ActionBanner tone="error" title="Acceso denegado" message={error} />}

        {googleEnabled && (
          <a
            href="/api/auth/google"
            className="btn-primary flex w-full items-center justify-center no-underline"
          >
            Continuar con Google
          </a>
        )}

        {googleEnabled && passwordEnabled && (
          <p className="text-center text-caption">o entra con la contraseña del equipo</p>
        )}

        {passwordEnabled && (
          <form onSubmit={onSubmit} className="space-y-4">
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
                disabled={pending}
                required
                autoFocus={!googleEnabled}
              />
            </div>
            <button
              type="submit"
              className={`${googleEnabled ? "btn-secondary" : "btn-primary"} w-full`}
              disabled={pending}
            >
              {pending ? "Entrando…" : googleEnabled ? "Entrar con contraseña" : "Entrar"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
