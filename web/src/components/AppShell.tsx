"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  BarChart3,
  BookOpen,
  Coins,
  FileSpreadsheet,
  LogOut,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import { redirectToLoginIfUnauthorized } from "@/lib/parse-api-response";
import { useMounted } from "@/hooks/use-mounted";
import { ProspeccionSessionProvider } from "@/contexts/prospeccion-session";

const NAV = [
  { href: "/resumen", label: "Resumen", icon: BarChart3 },
  { href: "/prospeccion", label: "Prospección", icon: Search },
  { href: "/portafolio", label: "Portafolio", icon: Users },
  { href: "/documentar", label: "Documentar", mobile: "Excel", icon: FileSpreadsheet },
  { href: "/conocimiento", label: "Conocimiento", icon: BookOpen },
  { href: "/conversaciones", label: "Conversaciones", icon: MessageSquare },
  { href: "/configuracion", label: "Configuración", mobile: "Ajustes", icon: Settings },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const [creditsMonth, setCreditsMonth] = useState<number | null>(null);
  const [creditsBudget, setCreditsBudget] = useState<number | null>(null);
  const [canLogout, setCanLogout] = useState(false);
  const isLogin = pathname === "/login";

  const isDark = theme === "dark";
  const logoSrc = isDark ? "/logos/logo-iac-white.png" : "/logos/logo-iac.png";
  const isProspeccion = pathname.startsWith("/prospeccion");
  const isWide =
    pathname.startsWith("/conversaciones") || pathname.startsWith("/portafolio");

  useEffect(() => {
    if (isLogin) return;
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d: { required?: boolean; authenticated?: boolean }) => {
        setCanLogout(Boolean(d.required || d.authenticated));
      })
      .catch(() => {});
  }, [isLogin]);

  useEffect(() => {
    if (isLogin) return;
    let cancelled = false;

    async function loadCredits() {
      try {
        const response = await fetch("/api/stats");
        if (redirectToLoginIfUnauthorized(response)) return;
        const data = await response.json();
        if (cancelled || !data || data.error) return;
        setCreditsMonth(data.apollo?.credits_this_month ?? 0);
        setCreditsBudget(data.apollo?.monthly_budget ?? null);
      } catch {
        /* la píldora queda en blanco si el resumen no responde */
      }
    }

    void loadCredits();
    const onBudgetChange = () => {
      void loadCredits();
    };
    window.addEventListener("apollo-budget-changed", onBudgetChange);
    return () => {
      cancelled = true;
      window.removeEventListener("apollo-budget-changed", onBudgetChange);
    };
  }, [isLogin]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Navegación principal">
        <Link href="/resumen" className="app-sidebar__brand">
          {mounted ? (
            <Image
              src={logoSrc}
              alt="IAC — Ingeniería Asistida por Computador"
              width={108}
              height={108}
              className="app-sidebar__logo"
              priority
            />
          ) : (
            <div className="app-sidebar__logo app-sidebar__logo--placeholder" />
          )}
        </Link>

        <nav className="app-sidebar__nav">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`app-nav-item${active ? " app-nav-item--active" : ""}`}
              >
                <Icon size={16} strokeWidth={1.5} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="app-sidebar__footer space-y-3">
          <Link href="/prospeccion" className="btn-primary w-full">
            <Plus size={16} strokeWidth={1.5} aria-hidden />
            Nueva búsqueda
          </Link>
          <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="btn-secondary w-full"
            aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          >
            {mounted ? (
              isDark ? (
                <Sun size={16} strokeWidth={1.5} aria-hidden />
              ) : (
                <Moon size={16} strokeWidth={1.5} aria-hidden />
              )
            ) : null}
            {mounted ? (isDark ? "Modo claro" : "Modo oscuro") : "···"}
          </button>
          {canLogout && (
            <button type="button" className="btn-secondary w-full" onClick={() => void logout()}>
              <LogOut size={16} strokeWidth={1.5} aria-hidden />
              Salir
            </button>
          )}
          <Link
            href="/configuracion"
            className={`app-credits-pill${
              creditsMonth != null &&
              creditsBudget != null &&
              creditsBudget > 0 &&
              creditsMonth / creditsBudget >= 0.85
                ? " app-credits-pill--warn"
                : ""
            }`}
            title="Créditos Apollo usados este mes. Abrir Configuración para cambiar el tope."
          >
            <Coins
              size={14}
              strokeWidth={1.5}
              className="text-[var(--color-accent)]"
              aria-hidden
            />
            <span>
              Apollo: <strong>{creditsMonth ?? "—"}</strong>
              {creditsBudget != null ? ` / ${creditsBudget}` : ""} créd. / mes
            </span>
          </Link>
        </div>
      </aside>

      <div className="app-main">
        <div className={`${isWide || isProspeccion ? "w-full" : "app-content"}`}>
          <ProspeccionSessionProvider>{children}</ProspeccionSessionProvider>
        </div>
      </div>

      <nav className="app-mobile-nav" aria-label="Navegación móvil">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`app-mobile-nav__item${active ? " app-mobile-nav__item--active" : ""}`}
            >
              <Icon size={20} strokeWidth={1.5} aria-hidden />
              <span>{"mobile" in item ? item.mobile : item.label.split(" ")[0]}</span>
            </Link>
          );
        })}
      </nav>

      {!pathname.startsWith("/prospeccion") && (
        <Link href="/prospeccion" className="app-mobile-cta" aria-label="Nueva búsqueda">
          <Plus size={22} strokeWidth={2} />
        </Link>
      )}

      <button
        type="button"
        className="app-theme-toggle-mobile"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      >
        {mounted ? (
          isDark ? (
            <Sun size={18} strokeWidth={1.5} aria-hidden />
          ) : (
            <Moon size={18} strokeWidth={1.5} aria-hidden />
          )
        ) : null}
      </button>
    </div>
  );
}
