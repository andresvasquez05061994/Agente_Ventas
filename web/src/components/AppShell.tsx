"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  BarChart3,
  Coins,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Sun,
  Users,
} from "lucide-react";
import { useMounted } from "@/hooks/use-mounted";
import { ProspeccionSessionProvider } from "@/contexts/prospeccion-session";

const NAV = [
  { href: "/resumen", label: "Resumen", icon: BarChart3 },
  { href: "/prospeccion", label: "Prospección", icon: Search },
  { href: "/portafolio", label: "Portafolio", icon: Users },
  { href: "/conversaciones", label: "Conversaciones", icon: MessageSquare },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const [creditsMonth, setCreditsMonth] = useState<number | null>(null);

  const isDark = theme === "dark";
  const logoSrc = isDark ? "/logos/logo-iac-white.png" : "/logos/logo-iac.png";
  const isProspeccion = pathname.startsWith("/prospeccion");
  const isWide =
    pathname.startsWith("/conversaciones") || pathname.startsWith("/portafolio");

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setCreditsMonth(d.apollo?.credits_this_month ?? 0);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Navegación principal">
        <Link href="/resumen" className="app-sidebar__brand">
          {mounted ? (
            <Image
              src={logoSrc}
              alt="IAC — Ingeniería Asistida por Computador"
              width={72}
              height={72}
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
          <div className="app-credits-pill" title="Créditos Apollo este mes">
            <Coins
              size={14}
              strokeWidth={1.5}
              className="text-[var(--color-accent)]"
              aria-hidden
            />
            <span>
              Apollo: <strong>{creditsMonth ?? "—"}</strong> créd. / mes
            </span>
          </div>
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
              <span>{item.label.split(" ")[0]}</span>
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
