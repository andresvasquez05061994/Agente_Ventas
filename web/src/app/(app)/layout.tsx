import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { currentSessionStatus } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const status = await currentSessionStatus();
  if (status !== "ok") redirect("/login");
  return <AppShell>{children}</AppShell>;
}
