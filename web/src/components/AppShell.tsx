"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Coins,
  MessageSquare,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { ProspeccionSessionProvider } from "@/contexts/prospeccion-session";

const NAV = [
  { href: "/resumen", label: "Resumen", icon: BarChart3 },
  { href: "/prospeccion", label: "Prospección", icon: Search },
  { href: "/portafolio", label: "Portafolio", icon: Users },
  { href: "/conversaciones", label: "Conversaciones", icon: MessageSquare },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [creditsMonth, setCreditsMonth] = useState<number | null>(null);

  const isWide =
    pathname.startsWith("/conversaciones") || pathname.startsWith("/portafolio");
  const isProspeccion = pathname.startsWith("/prospeccion");

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
        <div className="app-sidebar__brand">
          <div className="app-sidebar__logo" aria-hidden>
            IAC
          </div>
          <span className="app-sidebar__title">Agente</span>
        </div>

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
          <div className="app-credits-pill" title="Créditos Apollo este mes">
            <Coins size={14} strokeWidth={1.5} className="text-[var(--color-accent)]" aria-hidden />
            <span>
              Apollo: <strong>{creditsMonth ?? "—"}</strong> créd. / mes
            </span>
          </div>
        </div>
      </aside>

      <div className={`app-main${isWide ? "" : ""}`}>
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
    </div>
  );
}
