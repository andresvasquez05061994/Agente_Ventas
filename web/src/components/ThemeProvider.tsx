"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Dark mode only — sin toggle claro/oscuro. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" forcedTheme="dark" enableSystem={false}>
      {children}
    </NextThemesProvider>
  );
}
