"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/resumen", label: "Resumen" },
  { href: "/prospeccion", label: "Prospección" },
  { href: "/portafolio", label: "Portafolio" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = theme === "dark";
  const logoSrc = isDark ? "/logos/logo-iac-white.png" : "/logos/logo-iac.png";

  return (
    <div className="flex min-h-screen flex-col bg-white text-[#3D4F63] dark:bg-[#0F1419] dark:text-[#B8C5D3]">
      <header className="sticky top-0 z-50 border-b border-[#E2E6EA] bg-white dark:border-[#2A3544] dark:bg-[#0F1419]">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 lg:px-6">
          <Link href="/resumen" className="flex shrink-0 items-center gap-2.5">
            {mounted ? (
              <Image src={logoSrc} alt="IAC" width={100} height={32} className="h-8 w-auto" priority />
            ) : (
              <div className="h-8 w-20 rounded bg-[#003366]" />
            )}
            <span className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8A97A8] sm:block">
              Agente Ventas B2B
            </span>
          </Link>

          <nav className="flex flex-1 justify-center gap-0">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`border-b-2 px-4 py-4 text-[13px] font-medium transition-colors ${
                    active
                      ? "border-[#003366] font-bold text-[#1A2332] dark:border-[#4A8FD4] dark:text-[#E8EEF4]"
                      : "border-transparent text-[#6B7C93] hover:text-[#1A2332] dark:hover:text-[#E8EEF4]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className="rounded border border-[#C8D0D8] px-2.5 py-1.5 text-xs font-semibold text-[#1A2332] hover:bg-[#F4F6F8] dark:border-[#3D4D61] dark:text-[#E8EEF4] dark:hover:bg-[#1A222D]"
            >
              {mounted ? (isDark ? "Claro" : "Oscuro") : "···"}
            </button>
            <Link
              href="/prospeccion"
              className="rounded bg-[#003366] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#002244] dark:bg-[#4A8FD4] dark:hover:bg-[#6BA8E8]"
            >
              Nueva búsqueda
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1400px] flex-1 gap-0 px-0 lg:px-2">
        {children}
      </div>
    </div>
  );
}
