"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import {
  EmptyState,
  ActionBanner,
  FeedbackAnchor,
  KpiCard,
  KpiGrid,
  PageSubtitle,
  PageTitle,
  SectionBlock,
} from "@/components/ui";

type Stats = {
  total: number;
  nuevo: number;
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
  const nuevoPct = pct(stats?.nuevo ?? 0, stats?.total ?? 0);

  return (
    <main className="app-content flex-1 py-6 lg:py-8">
      <header className="page-header">
        <PageTitle>Resumen</PageTitle>
        <PageSubtitle>
          Actividad comercial del portafolio y consumo de créditos Apollo.
        </PageSubtitle>
      </header>

      {error && (
        <FeedbackAnchor>
          <ActionBanner tone="error" title="Resumen no disponible" message={error} />
        </FeedbackAnchor>
      )}

      {!stats && !error && (
        <div className="mt-6 space-y-6">
          <KpiGrid className="kpi-grid--4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="kpi-skeleton" />
            ))}
          </KpiGrid>
          <KpiGrid className="kpi-grid--4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={`apollo-${i}`} className="kpi-skeleton" />
            ))}
          </KpiGrid>
        </div>
      )}

      {stats && (
        <div className="mt-6 space-y-8">
          <SectionBlock
            label="Portafolio"
            title="Actividad comercial"
            description="Leads guardados y datos listos para contactar."
          >
            <KpiGrid className="kpi-grid--4">
              <KpiCard
                label="Leads prospectados"
                value={stats.total}
                sub="en portafolio"
                accent="amber"
                tag={{
                  positive: stats.total > 0,
                  label: stats.total > 0 ? `${nuevoPct}% nuevos` : "sin leads",
                }}
              />
              <KpiCard
                label="Nuevo"
                value={stats.nuevo}
                sub={`${nuevoPct}% del portafolio`}
                accent="gray"
                tag={{
                  positive: stats.nuevo > 0,
                  label: stats.nuevo > 0 ? "por contactar" : "sin pendientes",
                }}
              />
              <KpiCard
                label="Con email verificado"
                value={stats.with_email}
                sub={`${emailPct}% del portafolio`}
                accent="teal"
                tag={{ positive: emailPct >= 80, label: "email listo" }}
              />
              <KpiCard
                label="Con teléfono"
                value={stats.with_phone}
                sub={`${phonePct}% del portafolio`}
                accent="teal"
                tag={{ positive: phonePct >= 80, label: "móvil listo" }}
              />
            </KpiGrid>
          </SectionBlock>

          <SectionBlock
            label="Apollo"
            title="Consumo de créditos"
            description="Búsquedas ejecutadas y créditos gastados al enriquecer contactos."
          >
            <KpiGrid className="kpi-grid--4">
              <KpiCard
                label="Créditos usados (total)"
                value={apollo?.total_credits ?? 0}
                sub="acumulado histórico"
                accent="coral"
                tag={{ positive: true, label: "enriquecimiento" }}
              />
              <KpiCard
                label="Créditos este mes"
                value={apollo?.credits_this_month ?? 0}
                sub="período actual"
                accent="coral"
                tag={{
                  positive: (apollo?.credits_this_month ?? 0) === 0,
                  label: (apollo?.credits_this_month ?? 0) > 0 ? "consumo activo" : "sin consumo",
                }}
              />
              <KpiCard
                label="Búsquedas totales"
                value={apollo?.total_searches ?? 0}
                sub="ejecuciones acumuladas"
                accent="blue"
                tag={{ positive: true, label: "API Apollo" }}
              />
              <KpiCard
                label="Búsquedas este mes"
                value={apollo?.searches_this_month ?? 0}
                sub="período actual"
                accent="blue"
                tag={{
                  positive: (apollo?.searches_this_month ?? 0) > 0,
                  label: (apollo?.searches_this_month ?? 0) > 0 ? "activo" : "sin búsquedas",
                }}
              />
            </KpiGrid>
          </SectionBlock>

          {stats.total === 0 ? (
            <EmptyState
              message="Tu portafolio está vacío. Comienza prospectando en la pestaña de búsqueda."
              href="/prospeccion"
              cta="Ir a Prospección"
            />
          ) : (
            <p className="text-caption flex items-center gap-1">
              <Link href="/portafolio" className="btn-link inline-flex items-center gap-1">
                Ver portafolio completo
                <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden />
              </Link>
              <span className="text-micro ml-2 inline-flex items-center gap-0.5">
                {stats.total} leads
                {stats.nuevo > 0 && (
                  <>
                    <ArrowDownRight size={12} className="text-[var(--color-warning)]" aria-hidden />
                    {stats.nuevo} por contactar
                  </>
                )}
              </span>
            </p>
          )}
        </div>
      )}
    </main>
  );
}
