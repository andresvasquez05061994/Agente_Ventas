"use client";

import { useEffect } from "react";
import type { Lead } from "@/lib/types";
import type { ColdCallResult } from "@/lib/cold-call";
import { ActionBanner } from "@/components/ui";

type ColdCallPanelProps = {
  lead: Lead | null;
  loading: boolean;
  error: string;
  result: ColdCallResult | null;
  onClose: () => void;
  onRetry: () => void;
};

function copyFullScript(result: ColdCallResult, lead: Lead) {
  const text = [
    result.headline,
    "",
    `Apertura:\n${result.opening_line}`,
    "",
    `Por qué ahora:\n${result.why_now}`,
    "",
    "Valor para el cliente:",
    ...result.value_points.map((p) => `• ${p}`),
    "",
    `Pregunta de descubrimiento:\n${result.discovery_question}`,
    "",
    `Cierre:\n${result.closing}`,
    "",
    `Si objeta:\n${result.objection_tip}`,
    "",
    `— Contacto: ${lead.nombre}${lead.empresa ? ` · ${lead.empresa}` : ""}`,
  ].join("\n");

  void navigator.clipboard.writeText(text);
}

export function ColdCallPanel({
  lead,
  loading,
  error,
  result,
  onClose,
  onRetry,
}: ColdCallPanelProps) {
  useEffect(() => {
    if (!lead) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [lead, onClose]);

  if (!lead) return null;

  return (
    <div className="cold-call-overlay" onClick={onClose} role="presentation">
      <div
        className="cold-call-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cold-call-title"
      >
        <header className="cold-call-modal__header">
          <div className="cold-call-modal__header-text">
            <p className="cold-call-modal__eyebrow">Mensaje IA · llamada en frío</p>
            <h2 id="cold-call-title" className="cold-call-modal__title">
              {lead.nombre}
            </h2>
            <p className="cold-call-modal__meta">
              {[lead.cargo, lead.empresa].filter(Boolean).join(" · ") || "Sin cargo ni empresa"}
            </p>
          </div>
          <button type="button" className="cold-call-modal__close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="cold-call-modal__body">
          {loading && (
            <div className="cold-call-modal__loading">
              <div className="cold-call-modal__spinner" />
              <p>Analizando empresa y cargo con IA…</p>
              <span className="text-micro">Generando guion personalizado para el primer contacto</span>
            </div>
          )}

          {error && !loading && (
            <div className="cold-call-modal__error">
              <ActionBanner tone="error" title="No se generó el mensaje" message={error} />
              <button type="button" className="btn-secondary mt-3" onClick={onRetry}>
                Reintentar
              </button>
            </div>
          )}

          {result && !loading && (
            <>
              <div className="cold-call-modal__badge-row">
                <span className="cold-call-modal__badge">
                  {result.source === "mistral" ? `IA · ${result.model ?? "Mistral"}` : "Modo básico"}
                </span>
              </div>

              <section className="cold-call-block cold-call-block--hero">
                <h3 className="cold-call-block__label">Enfoque recomendado</h3>
                <p className="cold-call-block__hero-text">{result.headline}</p>
              </section>

              <section className="cold-call-block">
                <h3 className="cold-call-block__label">Apertura sugerida</h3>
                <p className="cold-call-block__text">{result.opening_line}</p>
              </section>

              <section className="cold-call-block">
                <h3 className="cold-call-block__label">Por qué ahora</h3>
                <p className="cold-call-block__text">{result.why_now}</p>
              </section>

              <section className="cold-call-block">
                <h3 className="cold-call-block__label">Valor para este perfil</h3>
                <ul className="cold-call-list">
                  {result.value_points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </section>

              <div className="cold-call-grid">
                <section className="cold-call-block">
                  <h3 className="cold-call-block__label">Pregunta de descubrimiento</h3>
                  <p className="cold-call-block__text">{result.discovery_question}</p>
                </section>
                <section className="cold-call-block">
                  <h3 className="cold-call-block__label">Cierre sugerido</h3>
                  <p className="cold-call-block__text">{result.closing}</p>
                </section>
              </div>

              <section className="cold-call-block cold-call-block--tip">
                <h3 className="cold-call-block__label">Si objeta</h3>
                <p className="cold-call-block__text">{result.objection_tip}</p>
              </section>
            </>
          )}
        </div>

        {result && !loading && (
          <footer className="cold-call-modal__footer">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => copyFullScript(result, lead)}
            >
              Copiar guion
            </button>
            <button type="button" className="btn-primary" onClick={onClose}>
              Listo
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
