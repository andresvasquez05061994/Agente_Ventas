"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  EmptyState,
  KpiCard,
  KpiGrid,
  PageSubtitle,
  PageTitle,
  SectionBlock,
} from "@/components/ui";

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

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

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
  const phonePct = pct(stats?.with_phone ?? 0, stats?.total ?? 0);
  const emailPct = pct(stats?.with_email ?? 0, stats?.total ?? 0);
  const approvedPct = pct(stats?.approved ?? 0, stats?.total ?? 0);

  return (
    <main className="flex-1 p-6 lg:p-8">
      <div className="page-header">
        <PageTitle>Resumen</PageTitle>
      </div>
      <PageSubtitle>
        Vista ejecutiva del pipeline de prospección y consumo de créditos Apollo en esta plataforma.
      </PageSubtitle>

      {error && (
        <div className="mt-4 rounded border-l-4 border-amber-500 bg-amber-50 p-3 text-caption text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {error}
        </div>
      )}

      {!stats && !error && (
        <KpiGrid>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="kpi-skeleton" />
          ))}
        </KpiGrid>
      )}

      {stats && (
        <>
          <SectionBlock
            label="Dimensión Apollo"
            title="Consumo de prospección"
            description="Créditos usados al enriquecer contactos (email y teléfono) desde esta plataforma. La búsqueda API no consume créditos."
          >
            <KpiGrid>
              <KpiCard
                label="Créditos consumidos"
                value={apollo?.total_credits ?? 0}
                sub="total acumulado"
                accent="coral"
                tag={{ positive: false, label: "enriquecimiento" }}
              />
              <KpiCard
                label="Créditos este mes"
                value={apollo?.credits_this_month ?? 0}
                sub="período actual"
                accent="coral"
                tag={{
                  positive: (apollo?.credits_this_month ?? 0) === 0,
                  label:
                    (apollo?.credits_this_month ?? 0) > 0
                      ? "consumo activo"
                      : "sin consumo",
                }}
              />
              <KpiCard
                label="Búsquedas realizadas"
                value={apollo?.total_searches ?? 0}
                sub="ejecuciones totales"
                accent="blue"
                tag={{ positive: true, label: "actividad API" }}
              />
              <KpiCard
                label="Búsquedas este mes"
                value={apollo?.searches_this_month ?? 0}
                sub="en el mes en curso"
                accent="blue"
                tag={{ positive: true, label: "prospección reciente" }}
              />
            </KpiGrid>
          </SectionBlock>

          <SectionBlock
            label="Dimensión comercial"
            title="Pipeline de leads"
            description="Contactos guardados en portafolio con email y teléfono verificados en la prospección Apollo."
          >
            {stats.total === 0 ? (
              <div className="mt-4">
                <EmptyState
                  message="Sin leads en el portafolio"
                  href="/prospeccion"
                  cta="Ir a Prospección"
                />
              </div>
            ) : (
              <KpiGrid>
                <KpiCard
                  label="Total en portafolio"
                  value={stats.total}
                  sub="contactos guardados"
                  accent="blue"
                  tag={{ positive: true, label: "pipeline activo" }}
                />
                <KpiCard
                  label="Con teléfono"
                  value={stats.with_phone}
                  sub={`${phonePct}% del portafolio`}
                  accent="teal"
                  tag={{ positive: phonePct >= 80, label: "móvil verificado" }}
                />
                <KpiCard
                  label="Con email"
                  value={stats.with_email}
                  sub={`${emailPct}% del portafolio`}
                  accent="teal"
                  tag={{ positive: emailPct >= 80, label: "email verificado" }}
                />
                <KpiCard
                  label="Aprobados para contacto"
                  value={stats.approved}
                  sub={`${approvedPct}% listos para venta`}
                  accent="gray"
                  tag={{
                    positive: stats.approved > 0,
                    label: stats.approved > 0 ? "listos para outreach" : "pendiente revisión",
                  }}
                />
              </KpiGrid>
            )}

            {stats.total > 0 && (
              <p className="text-caption mt-4">
                <Link href="/portafolio" className="text-[#003A70] font-semibold hover:underline dark:text-[#6BA3F7]">
                  Ver portafolio completo →
                </Link>
              </p>
            )}
          </SectionBlock>
        </>
      )}
    </main>
  );
}
