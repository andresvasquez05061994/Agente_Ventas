"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseApiResponse } from "@/lib/parse-api-response";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/resumen";
  const setup = searchParams.get("setup") === "1";
  const [password, setPassword] = useState("");
  const [error, setError] = useState(setup ? "Falta APP_PASSWORD en las variables de Vercel." : "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data: { authenticated?: boolean; required?: boolean }) => {
        if (data.authenticated || data.required === false) {
          router.replace(next.startsWith("/") ? next : "/resumen");
        }
      })
      .catch(() => {});
  }, [next, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const { data, error: apiError } = await parseApiResponse<{ ok?: boolean; next?: string; error?: string }>(
        res
      );
      if (!res.ok || apiError || data?.error) {
        setError(apiError ?? data?.error ?? "No se pudo entrar");
        return;
      }
      window.location.assign(data?.next || next);
    } catch {
      setError("No se pudo entrar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={(event) => void onSubmit(event)}>
        <p className="login-card__kicker">IAC · uso interno</p>
        <h1 className="login-card__title">Agente Ventas</h1>
        <p className="login-card__hint">Contraseña de equipo. No compartas el enlace público.</p>
        <label className="field-label" htmlFor="app-password">
          Contraseña
        </label>
        <input
          id="app-password"
          className="input-field"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error ? <p className="login-card__error">{error}</p> : null}
        <button type="submit" className="btn-primary mt-4 w-full" disabled={busy || !password}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="login-page" />}>
      <LoginForm />
    </Suspense>
  );
}
