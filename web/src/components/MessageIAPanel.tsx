"use client";

import { useEffect, useState } from "react";
import type { Lead } from "@/lib/types";
import type { ColdCallResult, ColdEmailResult, OutreachChannel } from "@/lib/commercial-outreach";
import { ActionBanner } from "@/components/ui";

type MessageIAPanelProps = {
  lead: Lead | null;
  activeChannel: OutreachChannel;
  loading: boolean;
  error: string;
  callResult: ColdCallResult | null;
  emailResult: ColdEmailResult | null;
  onClose: () => void;
  onChannelChange: (channel: OutreachChannel) => void;
  onRetry: () => void;
};

function copyCallScript(result: ColdCallResult, lead: Lead) {
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

function copyEmailScript(result: ColdEmailResult, lead: Lead) {
  const body = [
    result.greeting,
    "",
    result.hook,
    "",
    ...result.value_bullets.map((b) => `• ${b}`),
    "",
    result.body_close,
    "",
    result.cta,
    "",
    result.ps_line,
  ].join("\n");

  const text = [
    `Asunto: ${result.subject_line}`,
    `Preheader: ${result.preview_text}`,
    "",
    body,
    "",
    `— Para: ${lead.nombre}${lead.email ? ` <${lead.email}>` : ""}${lead.empresa ? ` · ${lead.empresa}` : ""}`,
  ].join("\n");

  void navigator.clipboard.writeText(text);
}

export function MessageIAPanel({
  lead,
  activeChannel,
  loading,
  error,
  callResult,
  emailResult,
  onClose,
  onChannelChange,
  onRetry,
}: MessageIAPanelProps) {
  const copyContextKey = `${activeChannel}:${callResult?.headline ?? ""}:${emailResult?.headline ?? ""}`;
  const [copiedForKey, setCopiedForKey] = useState<string | null>(null);
  const copied = copiedForKey === copyContextKey;

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

  const result = activeChannel === "email" ? emailResult : callResult;
  const channelLabel = activeChannel === "email" ? "correo electrónico en frío" : "llamada en frío";

  function handleCopy() {
    if (activeChannel === "email" && emailResult) {
      copyEmailScript(emailResult, lead!);
    } else if (callResult) {
      copyCallScript(callResult, lead!);
    }
    setCopiedForKey(copyContextKey);
    window.setTimeout(() => setCopiedForKey(null), 2000);
  }

  return (
    <div className="cold-call-overlay" onClick={onClose} role="presentation">
      <div
        className="cold-call-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="message-ia-title"
      >
        <header className="cold-call-modal__header">
          <div className="cold-call-modal__header-text">
            <p className="cold-call-modal__eyebrow">Mensaje IA · prospección comercial</p>
            <h2 id="message-ia-title" className="cold-call-modal__title">
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

        <div className="message-ia-tabs" role="tablist" aria-label="Tipo de mensaje">
          <button
            type="button"
            role="tab"
            aria-selected={activeChannel === "call"}
            className={`message-ia-tabs__btn ${activeChannel === "call" ? "message-ia-tabs__btn--active" : ""}`}
            onClick={() => onChannelChange("call")}
            disabled={loading}
          >
            Llamada en frío
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeChannel === "email"}
            className={`message-ia-tabs__btn ${activeChannel === "email" ? "message-ia-tabs__btn--active" : ""}`}
            onClick={() => onChannelChange("email")}
            disabled={loading}
          >
            Correo electrónico en frío
          </button>
        </div>

        <div className="cold-call-modal__body">
          {loading && (
            <div className="cold-call-modal__loading">
              <div className="cold-call-modal__spinner" />
              <p>Generando {channelLabel}…</p>
              <span className="text-micro">
                Personalizando enfoque para {lead.cargo || "el cargo"} en {lead.empresa || "la empresa"}
              </span>
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

          {activeChannel === "call" && callResult && !loading && (
            <>
              <div className="cold-call-modal__badge-row">
                <span className="cold-call-modal__badge">
                  {callResult.source === "mistral" ? `IA · ${callResult.model ?? "Mistral"}` : "Modo básico"}
                </span>
              </div>

              <section className="cold-call-block cold-call-block--hero">
                <h3 className="cold-call-block__label">Enfoque recomendado</h3>
                <p className="cold-call-block__hero-text">{callResult.headline}</p>
              </section>

              <section className="cold-call-block">
                <h3 className="cold-call-block__label">Apertura sugerida</h3>
                <p className="cold-call-block__text">{callResult.opening_line}</p>
              </section>

              <section className="cold-call-block">
                <h3 className="cold-call-block__label">Por qué ahora</h3>
                <p className="cold-call-block__text">{callResult.why_now}</p>
              </section>

              <section className="cold-call-block">
                <h3 className="cold-call-block__label">Valor para este perfil</h3>
                <ul className="cold-call-list">
                  {callResult.value_points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </section>

              <div className="cold-call-grid">
                <section className="cold-call-block">
                  <h3 className="cold-call-block__label">Pregunta de descubrimiento</h3>
                  <p className="cold-call-block__text">{callResult.discovery_question}</p>
                </section>
                <section className="cold-call-block">
                  <h3 className="cold-call-block__label">Cierre sugerido</h3>
                  <p className="cold-call-block__text">{callResult.closing}</p>
                </section>
              </div>

              <section className="cold-call-block cold-call-block--tip">
                <h3 className="cold-call-block__label">Si objeta</h3>
                <p className="cold-call-block__text">{callResult.objection_tip}</p>
              </section>
            </>
          )}

          {activeChannel === "email" && emailResult && !loading && (
            <>
              <div className="cold-call-modal__badge-row">
                <span className="cold-call-modal__badge">
                  {emailResult.source === "mistral" ? `IA · ${emailResult.model ?? "Mistral"}` : "Modo básico"}
                </span>
              </div>

              <section className="cold-call-block cold-call-block--hero">
                <h3 className="cold-call-block__label">Enfoque del correo</h3>
                <p className="cold-call-block__hero-text">{emailResult.headline}</p>
              </section>

              <div className="cold-call-grid">
                <section className="cold-call-block">
                  <h3 className="cold-call-block__label">Asunto</h3>
                  <p className="cold-call-block__text cold-call-block__text--strong">{emailResult.subject_line}</p>
                </section>
                <section className="cold-call-block">
                  <h3 className="cold-call-block__label">Vista previa (preheader)</h3>
                  <p className="cold-call-block__text">{emailResult.preview_text}</p>
                </section>
              </div>

              <section className="cold-call-block">
                <h3 className="cold-call-block__label">Cuerpo del correo</h3>
                <div className="message-ia-email-body">
                  <p>{emailResult.greeting}</p>
                  <p>{emailResult.hook}</p>
                  <ul className="cold-call-list">
                    {emailResult.value_bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                  <p>{emailResult.body_close}</p>
                  <p className="cold-call-block__text--strong">{emailResult.cta}</p>
                  <p className="message-ia-email-ps">{emailResult.ps_line}</p>
                </div>
              </section>
            </>
          )}
        </div>

        {result && !loading && (
          <footer className="cold-call-modal__footer">
            <button type="button" className="btn-secondary" onClick={handleCopy}>
              {copied ? "Copiado" : activeChannel === "email" ? "Copiar correo" : "Copiar guion"}
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
