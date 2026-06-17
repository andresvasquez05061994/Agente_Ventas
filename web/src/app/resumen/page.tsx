"use client";

import { useEffect, useState } from "react";
import { EmptyState, MetricCard, SectionLabel } from "@/components/ui";

type Stats = {
  total: number;
  approved: number;
  with_phone: number;
  with_email: number;
  apollo?: {
    total_credits: number;
    total_searches: number;
    credits_this_month: number;
    searches_this_month: number;
  };
};

export default function ResumenPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setStats(d)))
      .catch(() => setError("No se pudo cargar el resumen"));
  }, []);

  const apollo = stats?.apollo;

  return (
    <main className="flex-1 p-6 lg:p-8">
      <h1 className="border-b-2 border-[#003366] pb-2 text-xl font-bold text-[#1A2332] dark:text-[#E8EEF4]">
        Resumen
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-[#6B7C93]">
        Vista ejecutiva del pipeline de prospección y consumo de créditos Apollo en esta
        plataforma.
      </p>

      {error && (
        <div className="mt-4 rounded border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {error}
        </div>
      )}

      {!stats && !error && (
        <p className="mt-8 text-sm text-[#6B7C93]">Cargando...</p>
      )}

      {stats && (
        <>
          <div className="mt-8">
            <SectionLabel>Consumo Apollo (prospección)</SectionLabel>
            <p className="mb-4 text-xs text-[#6B7C93]">
              Solo créditos usados al buscar y enriquecer contactos desde esta plataforma.
              La búsqueda API no consume créditos; el enriquecimiento (email/teléfono) sí.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Créditos consumidos (total)"
                value={apollo?.total_credits ?? 0}
              />
              <MetricCard
                label="Créditos este mes"
                value={apollo?.credits_this_month ?? 0}
              />
              <MetricCard
                label="Búsquedas realizadas"
                value={apollo?.total_searches ?? 0}
              />
              <MetricCard
                label="Búsquedas este mes"
                value={apollo?.searches_this_month ?? 0}
              />
            </div>
          </div>

          <div className="mt-10">
            <SectionLabel>Pipeline de leads</SectionLabel>
            {stats.total === 0 ? (
              <div className="mt-4">
                <EmptyState
                  message="Sin leads en el portafolio"
                  href="/prospeccion"
                  cta="Ir a Prospección"
                />
              </div>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label="Total leads" value={stats.total} />
                <MetricCard label="Con teléfono" value={stats.with_phone} />
                <MetricCard label="Con email" value={stats.with_email} />
                <MetricCard label="Aprobados" value={stats.approved} />
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
