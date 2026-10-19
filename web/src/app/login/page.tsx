"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseApiResponse } from "@/lib/parse-api-response";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/resumen";
  const setup = searchParams.get("setup") === "1";
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(setup ? "Falta ADMIN_EMAIL en las variables de Vercel." : "");
  const [notice, setNotice] = useState("");
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
    setNotice("");
    try {
      if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const { data, error: apiError } = await parseApiResponse<{ message?: string; error?: string }>(res);
        if (!res.ok || apiError || data?.error) {
          setError(apiError ?? data?.error ?? "No se pudo crear la cuenta");
          return;
        }
        setNotice(data?.message ?? "Solicitud enviada. Podrás entrar cuando el administrador la apruebe.");
        setMode("login");
        setPassword("");
        return;
      }

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
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
      setError(mode === "register" ? "No se pudo crear la cuenta" : "No se pudo entrar");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = email.includes("@") && password.length >= (mode === "register" ? 8 : 1);

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={(event) => void onSubmit(event)}>
        <p className="login-card__kicker">IAC · Agente Ventas</p>
        <h1 className="login-card__title">{mode === "login" ? "Entrar" : "Crear cuenta"}</h1>
        <p className="login-card__hint">
          {mode === "login"
            ? "Usa el correo y la contraseña de tu cuenta. Si acabas de registrarte, espera la aprobación."
            : "La cuenta queda pendiente hasta que el administrador la apruebe."}
        </p>
        <label className="field-label" htmlFor="login-email">
          Correo
        </label>
        <input
          id="login-email"
          className="input-field"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label className="field-label mt-3" htmlFor="login-password">
          Contraseña
        </label>
        <input
          id="login-password"
          className="input-field"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={mode === "register" ? 8 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {mode === "register" ? <p className="login-card__hint">Mínimo 8 caracteres.</p> : null}
        {notice ? <p className="login-card__hint">{notice}</p> : null}
        {error ? <p className="login-card__error">{error}</p> : null}
        <button type="submit" className="btn-primary mt-4 w-full" disabled={busy || !canSubmit}>
          {busy ? "Enviando…" : mode === "login" ? "Entrar" : "Solicitar acceso"}
        </button>
        <button
          type="button"
          className="login-card__switch"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
            setNotice("");
          }}
        >
          {mode === "login" ? "Crear una cuenta" : "Ya tengo cuenta"}
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
