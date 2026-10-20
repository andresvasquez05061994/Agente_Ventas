"use client";

import { useEffect, useRef } from "react";
import type { EtapaComercial, GestionResultado, Lead, LeadStatus } from "@/lib/types";
import { ETAPAS_COMERCIALES, GESTION_RESULTADOS, LEAD_STATUSES, etapaOf } from "@/lib/types";

type ClientFichaProps = {
  loading: boolean;
  error: string;
  contacts: Lead[];
  colleagues: string[];
  openedId: number | null;
  showOwner: boolean;
  savingId: number | null;
  savingEtapa: boolean;
  onClose: () => void;
  onStatus: (id: number, status: LeadStatus) => void;
  onResultado: (id: number, resultado: GestionResultado | "") => void;
  onEtapa: (leadId: number, etapa: EtapaComercial) => void;
  onOpenMessage: (lead: Lead) => void;
};

export function whyLine(lead: Pick<Lead, "fuente_busqueda" | "cargo" | "pais">): string {
  const raw = lead.fuente_busqueda?.trim();
  if (raw && raw.toLowerCase() !== "apollo") {
    return raw
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" · ");
  }
  return [lead.cargo, lead.pais].filter(Boolean).join(" · ");
}

export function ClientFicha({
  loading,
  error,
  contacts,
  colleagues,
  openedId,
  showOwner,
  savingId,
  savingEtapa,
  onClose,
  onStatus,
  onResultado,
  onEtapa,
  onOpenMessage,
}: ClientFichaProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const opened = contacts.find((lead) => lead.id === openedId) ?? contacts[0];
  const empresa = opened?.empresa?.trim() || "Sin empresa";
  const why = opened ? whyLine(opened) : "";
  const colleagueLine = colleagues.length ? `Ya la trabaja ${colleagues.join(", ")}` : "";
  const etapa = etapaOf(opened?.etapa_comercial);
  const hasCompany = Boolean(opened?.empresa?.trim());

  return (
    <div className="cold-call-overlay client-ficha-overlay" onClick={onClose} role="presentation">
      <div
        className="cold-call-modal client-ficha"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-ficha-title"
      >
        <header className="cold-call-modal__header">
          <div className="cold-call-modal__header-text">
            <p className="cold-call-modal__eyebrow">Cliente</p>
            <h2 id="client-ficha-title" className="cold-call-modal__title">
              {empresa}
            </h2>
            {why ? <p className="cold-call-modal__meta client-ficha__why">{why}</p> : null}
            {colleagueLine ? (
              <p className="client-ficha__collision" title={colleagueLine}>
                {colleagueLine}
              </p>
            ) : null}
          </div>
          <button type="button" className="cold-call-modal__close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="cold-call-modal__body">
          {opened ? (
            <label
              className="client-ficha__etapa"
              title={
                hasCompany
                  ? "Etapa de la empresa: aplica a todos sus contactos."
                  : "Sin empresa registrada: la etapa aplica solo a este contacto."
              }
            >
              <span className="text-micro">Etapa de la empresa</span>
              <select
                className="input-field"
                value={etapa}
                disabled={loading || savingEtapa}
                onChange={(event) => onEtapa(opened.id, event.target.value as EtapaComercial)}
              >
                {ETAPAS_COMERCIALES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {loading ? <p className="text-caption">Cargando ficha…</p> : null}
          {error ? <p className="text-caption">{error}</p> : null}
          {!loading && !error && (
            <ul className="client-ficha__list">
              {contacts.map((lead) => (
                <li key={lead.id} className="client-ficha__person">
                  <div className="client-ficha__person-head">
                    <p className="client-ficha__name">{lead.nombre}</p>
                    <p className="text-caption">
                      {[lead.cargo, lead.telefono, lead.email].filter(Boolean).join(" · ")}
                    </p>
                    {showOwner && lead.owner_email ? (
                      <p className="text-micro">{lead.owner_email}</p>
                    ) : null}
                    {lead.notas?.trim() ? (
                      <p className="text-caption client-ficha__notes">{lead.notas.trim()}</p>
                    ) : null}
                  </div>
                  <div className="client-ficha__fields">
                    <label className="client-ficha__field">
                      <span className="text-micro">Estado</span>
                      <select
                        className="input-field"
                        value={lead.lead_status}
                        disabled={savingId === lead.id}
                        onChange={(event) => onStatus(lead.id, event.target.value as LeadStatus)}
                      >
                        {LEAD_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="client-ficha__field">
                      <span className="text-micro">Resultado</span>
                      <select
                        className="input-field"
                        value={lead.resultado_gestion ?? ""}
                        disabled={savingId === lead.id}
                        onChange={(event) =>
                          onResultado(lead.id, event.target.value as GestionResultado | "")
                        }
                      >
                        <option value="">Sin resultado</option>
                        {GESTION_RESULTADOS.map((resultado) => (
                          <option key={resultado} value={resultado}>
                            {resultado}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <button type="button" className="btn-ia" onClick={() => onOpenMessage(lead)}>
                    Mensaje IA
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
