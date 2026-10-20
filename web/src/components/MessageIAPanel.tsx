"use client";

import { useEffect, useRef, useState } from "react";
import type { Lead } from "@/lib/types";
import {
  outreachPlainText,
  type ColdCallResult,
  type ColdEmailResult,
  type OutreachChannel,
  type OutreachPersonalization,
  type WhatsAppDraftResult,
} from "@/lib/commercial-outreach";
import { ActionBanner } from "@/components/ui";

/** La API añade el id del mensaje guardado para registrar su uso. */
export type WithMessageId<T> = T & { message_id?: number | null };

type MessageIAPanelProps = {
  lead: Lead | null;
  activeChannel: OutreachChannel;
  loading: boolean;
  error: string;
  callResult: WithMessageId<ColdCallResult> | null;
  emailResult: WithMessageId<ColdEmailResult> | null;
  whatsappResult: WithMessageId<WhatsAppDraftResult> | null;
  onClose: () => void;
  onChannelChange: (channel: OutreachChannel) => void;
  onRetry: () => void;
  /** Se llama al copiar: registra el uso del mensaje (trazabilidad, no envío). */
  onCopied: (messageId: number | null | undefined) => void;
};

const CHANNEL_TABS: Array<{ id: OutreachChannel; label: string }> = [
  { id: "call", label: "Llamada" },
  { id: "email", label: "Correo" },
  { id: "whatsapp", label: "WhatsApp" },
];

const APPROACH_LABEL: Record<OutreachPersonalization["approach"], string> = {
  "primer contacto": "Primer contacto",
  seguimiento: "Seguimiento",
  "siguiente paso": "Siguiente paso",
  reactivación: "Reactivación",
  oportunidad: "Oportunidad abierta",
  cliente: "Cliente activo",
};

function PersonalizationBlock({ personalization }: { personalization: OutreachPersonalization }) {
  const basis =
    personalization.knowledge_basis === "documentos"
      ? "Documentos cargados en Conocimiento: las cifras son citables con su fuente."
      : "Catálogo IAC de referencia interna: las cifras son orientativas, no hechos verificados.";
  return (
    <section className="cold-call-block cold-call-block--tip">
      <h3 className="cold-call-block__label">Contexto usado (IAC + prospecto)</h3>
      <p className="text-micro message-ia-stage">
        <strong>{APPROACH_LABEL[personalization.approach]}</strong> · {personalization.stage_summary}
      </p>
      <p className="cold-call-block__text">{personalization.company_insight}</p>
      {personalization.iac_solutions.length > 0 && (
        <ul className="cold-call-list">
          {personalization.iac_solutions.map((s, index) => (
            <li key={s}>{index === 0 ? `★ ${s} (principal)` : `${s} (complementaria)`}</li>
          ))}
        </ul>
      )}
      <p className="text-micro mt-2">{basis}</p>
      <p className="text-micro">
        Fuentes: {personalization.intel_sources.join(" · ")}
        {personalization.company_domain ? ` · ${personalization.company_domain}` : ""}
      </p>
    </section>
  );
}

export function MessageIAPanel({
  lead,
  activeChannel,
  loading,
  error,
  callResult,
  emailResult,
  whatsappResult,
  onClose,
  onChannelChange,
  onRetry,
  onCopied,
}: MessageIAPanelProps) {
  const result =
    activeChannel === "email" ? emailResult : activeChannel === "whatsapp" ? whatsappResult : callResult;
  const copyContextKey = `${activeChannel}:${result?.message_id ?? result?.headline ?? ""}`;
  const [copiedForKey, setCopiedForKey] = useState<string | null>(null);
  const copied = copiedForKey === copyContextKey;
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!lead) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [lead]);

  if (!lead) return null;

  const channelLabel =
    activeChannel === "email"
      ? "correo electrónico"
      : activeChannel === "whatsapp"
        ? "mensaje de WhatsApp"
        : "guion de llamada";

  function copyText(text: string) {
    void navigator.clipboard.writeText(text);
    onCopied(result?.message_id);
    setCopiedForKey(copyContextKey);
    window.setTimeout(() => setCopiedForKey(null), 2000);
  }

  function handleCopy() {
    if (!result) return;
    const suffix =
      result.channel === "email"
        ? `\n\n— Para: ${lead!.nombre}${lead!.email ? ` <${lead!.email}>` : ""}${lead!.empresa ? ` · ${lead!.empresa}` : ""}`
        : result.channel === "call"
          ? `\n\n— Contacto: ${lead!.nombre}${lead!.empresa ? ` · ${lead!.empresa}` : ""}`
          : "";
    copyText(`${outreachPlainText(result)}${suffix}`);
  }

  const copyLabel =
    activeChannel === "email" ? "Copiar correo" : activeChannel === "whatsapp" ? "Copiar mensaje" : "Copiar guion";

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
            <p className="cold-call-modal__eyebrow">Mensaje IA</p>
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
          {CHANNEL_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeChannel === tab.id}
              className={`message-ia-tabs__btn ${activeChannel === tab.id ? "message-ia-tabs__btn--active" : ""}`}
              onClick={() => onChannelChange(tab.id)}
              disabled={loading}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="cold-call-modal__body">
          {loading && (
            <div className="cold-call-modal__loading">
              <div className="cold-call-modal__spinner" />
              <p>Generando {channelLabel}…</p>
              <span className="text-micro">
                Analizando {lead.empresa || "la empresa"}, el historial y la etapa del contacto
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

          {result && !loading && (
            <div className="cold-call-modal__badge-row">
              <span className="cold-call-modal__badge">
                {result.source === "mistral" ? `IA · ${result.model ?? "Mistral"}` : "Modo básico"}
              </span>
              {result.message_id ? (
                <span className="cold-call-modal__badge">Guardado en el historial del contacto</span>
              ) : null}
            </div>
          )}

          {activeChannel === "call" && callResult && !loading && (
            <>
              <section className="cold-call-block cold-call-block--hero">
                <h3 className="cold-call-block__label">Enfoque recomendado</h3>
                <p className="cold-call-block__hero-text">{callResult.headline}</p>
              </section>

              <PersonalizationBlock personalization={callResult.personalization} />

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
              <section className="cold-call-block cold-call-block--hero">
                <h3 className="cold-call-block__label">Enfoque del correo</h3>
                <p className="cold-call-block__hero-text">{emailResult.headline}</p>
              </section>

              <PersonalizationBlock personalization={emailResult.personalization} />

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

          {activeChannel === "whatsapp" && whatsappResult && !loading && (
            <>
              <section className="cold-call-block cold-call-block--hero">
                <h3 className="cold-call-block__label">Enfoque del mensaje</h3>
                <p className="cold-call-block__hero-text">{whatsappResult.headline}</p>
              </section>

              <PersonalizationBlock personalization={whatsappResult.personalization} />

              <section className="cold-call-block">
                <h3 className="cold-call-block__label">Mensaje para copiar</h3>
                <p className="cold-call-block__text message-ia-whatsapp">{whatsappResult.message}</p>
                <p className="text-micro mt-1">
                  {whatsappResult.message.length} caracteres · se envía desde tu propio WhatsApp; la plataforma no
                  envía nada.
                </p>
              </section>

              {whatsappResult.follow_up ? (
                <section className="cold-call-block cold-call-block--tip">
                  <h3 className="cold-call-block__label">Si no responde en 3 días</h3>
                  <p className="cold-call-block__text message-ia-whatsapp">{whatsappResult.follow_up}</p>
                  <button
                    type="button"
                    className="btn-link mt-2"
                    onClick={() => copyText(whatsappResult.follow_up)}
                  >
                    Copiar recordatorio
                  </button>
                </section>
              ) : null}
            </>
          )}
        </div>

        {result && !loading && (
          <footer className="cold-call-modal__footer">
            <button type="button" className="btn-secondary" onClick={handleCopy}>
              {copied ? "Copiado" : copyLabel}
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
