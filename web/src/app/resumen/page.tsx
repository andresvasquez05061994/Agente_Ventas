"use client";

import { useEffect, useState } from "react";
import { EmptyState, MetricCard } from "@/components/ui";

type Stats = { total: number; approved: number; with_phone: number; with_email: number };

export default function ResumenPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setStats(d)))
      .catch(() => setError("No se pudo cargar el resumen"));
  }, []);

  return (
    <main className="flex-1 p-6 lg:p-8">
      <h1 className="border-b-2 border-[#003366] pb-2 text-xl font-bold text-[#1A2332] dark:text-[#E8EEF4]">
        Resumen
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-[#6B7C93]">
        Vista ejecutiva del pipeline de prospección.
      </p>

      {error && (
        <div className="mt-4 rounded border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {error}
          {!process.env.NEXT_PUBLIC_HAS_DB && (
            <span className="block mt-1 text-xs">
              Configura DATABASE_URL (Neon) en Vercel para persistir leads.
            </span>
          )}
        </div>
      )}

      {stats && stats.total === 0 ? (
        <div className="mt-8">
          <EmptyState message="Sin leads en el pipeline" href="/prospeccion" cta="Ir a Prospección" />
        </div>
      ) : stats ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total leads" value={stats.total} />
          <MetricCard label="Con teléfono" value={stats.with_phone} />
          <MetricCard label="Con email" value={stats.with_email} />
          <MetricCard label="Aprobados" value={stats.approved} />
        </div>
      ) : (
        <p className="mt-8 text-sm text-[#6B7C93]">Cargando...</p>
      )}
    </main>
  );
}
