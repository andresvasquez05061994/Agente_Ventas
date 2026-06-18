"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useMounted } from "@/hooks/use-mounted";

const NAV = [
  { href: "/resumen", label: "Resumen" },
  { href: "/prospeccion", label: "Prospección" },
  { href: "/portafolio", label: "Portafolio" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  const isDark = theme === "dark";
  const logoSrc = isDark ? "/logos/logo-iac-white.png" : "/logos/logo-iac.png";

  return (
    <div className="flex min-h-screen flex-col bg-white text-[#6B7C93] dark:bg-[#0F1419] dark:text-[#B8C5D3]">
      <header className="sticky top-0 z-50 border-b border-[#E2E6EA] bg-white dark:border-[#2A3544] dark:bg-[#0F1419]">
        <div className="mx-auto flex h-[50px] max-w-[1400px] items-center gap-4 px-4 lg:px-6">
          <Link href="/resumen" className="flex shrink-0 items-center gap-2.5">
            {mounted ? (
              <Image src={logoSrc} alt="IAC" width={100} height={32} className="h-8 w-auto" priority />
            ) : (
              <div className="h-8 w-20 rounded bg-[#003A70]" />
            )}
            <span className="hidden text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8A97A8] sm:block">
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
                  className={`border-b-2 px-4 py-3 text-[12px] transition-colors ${
                    active
                      ? "border-[#003A70] font-semibold text-[#051C2C] dark:border-[#4A8FD4] dark:text-[#E8EEF4]"
                      : "border-transparent font-medium text-[#6B7C93] hover:text-[#051C2C] dark:hover:text-[#E8EEF4]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setTheme(isDark ? "light" : "dark")} className="btn-secondary">
              {mounted ? (isDark ? "Claro" : "Oscuro") : "···"}
            </button>
            <Link href="/prospeccion" className="btn-primary px-2.5 py-1.5">
              Nueva búsqueda
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1400px] flex-1 gap-0 px-0 lg:px-2">{children}</div>
    </div>
  );
}
