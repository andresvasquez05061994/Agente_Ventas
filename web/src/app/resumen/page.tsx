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

const PIPELINE_STAGES = [
  "Prospectado",
  "Contactado",
  "En conversación",
  "Agendado",
  "Cerrado",
] as const;

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
    <main className="app-content flex-1 py-6 lg:py-8">
      <header className="page-header flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageTitle>Resumen</PageTitle>
          <PageSubtitle>
            Pipeline de prospección y consumo de créditos Apollo en la plataforma.
          </PageSubtitle>
        </div>
        <select className="input-field w-auto min-w-[160px] text-[13px]" defaultValue="month" aria-label="Período">
          <option value="week">Última semana</option>
          <option value="month">Último mes</option>
          <option value="quarter">Último trimestre</option>
        </select>
      </header>

      {error && (
        <FeedbackAnchor>
          <ActionBanner tone="error" title="Resumen no disponible" message={error} />
        </FeedbackAnchor>
      )}

      {!stats && !error && (
        <KpiGrid className="kpi-grid--4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="kpi-skeleton" />
          ))}
        </KpiGrid>
      )}

      {stats && (
        <>
          <KpiGrid className="kpi-grid--4 mt-6">
            <KpiCard
              label="Leads prospectados"
              value={stats.total}
              sub="en portafolio"
              accent="amber"
              tag={{
                positive: stats.total > 0,
                label: stats.total > 0 ? `${approvedPct}% aprobados` : "sin leads",
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
            <KpiCard
              label="Créditos Apollo usados"
              value={apollo?.total_credits ?? 0}
              sub={`${apollo?.credits_this_month ?? 0} este mes`}
              accent="coral"
              tag={{
                positive: (apollo?.credits_this_month ?? 0) === 0,
                label: (apollo?.credits_this_month ?? 0) > 0 ? "consumo activo" : "sin consumo mes",
              }}
            />
          </KpiGrid>

          {stats.total > 0 && (
            <section className="ui-card mt-6">
              <p className="section-label">Pipeline</p>
              <h2 className="section-block__title">Embudo comercial</h2>
              <p className="section-block__desc mb-2">
                Distribución estimada por etapa según el estado actual del portafolio.
              </p>
              <div className="pipeline-funnel" role="img" aria-label="Embudo de pipeline">
                <div className="pipeline-funnel__seg pipeline-funnel__seg--1" style={{ flex: stats.total }} />
                <div className="pipeline-funnel__seg pipeline-funnel__seg--2" style={{ flex: stats.approved }} />
                <div
                  className="pipeline-funnel__seg pipeline-funnel__seg--3"
                  style={{ flex: Math.max(1, Math.round(stats.total * 0.3)) }}
                />
                <div
                  className="pipeline-funnel__seg pipeline-funnel__seg--4"
                  style={{ flex: Math.max(0, stats.approved) }}
                />
                <div className="pipeline-funnel__seg pipeline-funnel__seg--5" style={{ flex: Math.max(0, Math.floor(stats.approved / 2)) }} />
              </div>
              <div className="pipeline-legend">
                {PIPELINE_STAGES.map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </div>
            </section>
          )}

          <SectionBlock
            label="Apollo"
            title="Actividad de prospección"
            description="Búsquedas ejecutadas y créditos consumidos al enriquecer contactos."
          >
            <KpiGrid className="kpi-grid--4">
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
                  label: (apollo?.searches_this_month ?? 0) > 0 ? "activo" : "quieto",
                }}
              />
              <KpiCard
                label="Aprobados contacto"
                value={stats.approved}
                sub={`${approvedPct}% listos`}
                accent="gray"
                tag={{
                  positive: stats.approved > 0,
                  label: stats.approved > 0 ? "outreach" : "revisión",
                }}
              />
              <KpiCard
                label="Tendencia email"
                value={`${emailPct}%`}
                sub="cobertura email"
                accent="teal"
                tag={{
                  positive: emailPct >= 50,
                  label: emailPct >= 50 ? "↑ cobertura" : "↓ mejorable",
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
            <p className="text-caption mt-6 flex items-center gap-1">
              <Link href="/portafolio" className="btn-link inline-flex items-center gap-1">
                Ver portafolio completo
                <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden />
              </Link>
              <span className="text-micro ml-2 inline-flex items-center gap-0.5">
                {stats.total} leads
                {approvedPct < 50 && (
                  <>
                    <ArrowDownRight size={12} className="text-[var(--color-warning)]" aria-hidden />
                    aumenta aprobaciones
                  </>
                )}
              </span>
            </p>
          )}
        </>
      )}
    </main>
  );
}
