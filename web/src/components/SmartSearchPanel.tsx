"use client";

import { useEffect, useState } from "react";
import type { SmartSearchResult } from "@/lib/smart-search";
import {
  APOLLO_COUNTRIES,
  APOLLO_EMPLOYEE_RANGES,
  APOLLO_KEYWORDS,
  APOLLO_SENIORITIES,
} from "@/lib/apollo-filters";
import { ActionBanner, FieldLabel, type FeedbackTone } from "@/components/ui";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

type SmartSearchPanelProps = {
  disabled?: boolean;
  /** Aplica los filtros al panel lateral sin gastar créditos. */
  onApply: (result: SmartSearchResult) => void | Promise<void>;
  /** Aplica los filtros y ejecuta la búsqueda en Apollo (gasta créditos). */
  onSearch: (result: SmartSearchResult) => void | Promise<void>;
};

function labelOf(list: ReadonlyArray<{ label: string; value: string }>, value: string): string {
  return list.find((item) => item.value === value)?.label ?? value;
}

function CriteriaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="smart-criteria__row">
      <dt className="smart-criteria__label">{label}</dt>
      <dd className="smart-criteria__value">{children}</dd>
    </div>
  );
}

/** Tarjeta de criterios interpretados: el vendedor confirma antes de gastar créditos. */
function InterpretedCriteria({
  result,
  disabled,
  onSearch,
  onAdjust,
  onDismiss,
}: {
  result: SmartSearchResult;
  disabled: boolean;
  onSearch: () => void;
  onAdjust: () => void;
  onDismiss: () => void;
}) {
  const { filters, insight } = result;
  const titles = filters.titles ?? [];
  const needSignals = insight?.need_signals ?? [];
  const sizeLabels = (filters.employeeRanges ?? []).map((range) => labelOf(APOLLO_EMPLOYEE_RANGES, range));

  return (
    <section className="smart-criteria" aria-label="Criterios interpretados">
      <header className="smart-criteria__head">
        <p className="smart-criteria__title">Criterios interpretados</p>
        <span className="smart-search-ia-badge">
          {result.source === "mistral" ? `IA · ${result.model ?? "Mistral"}` : "Modo básico"}
        </span>
      </header>

      <dl className="smart-criteria__list">
        <CriteriaRow label="País">{labelOf(APOLLO_COUNTRIES, filters.country)}</CriteriaRow>
        <CriteriaRow label="Cargos">
          <span className="smart-criteria__chips">
            {titles.map((title) => (
              <span key={title} className="smart-criteria__chip">
                {title}
              </span>
            ))}
          </span>
        </CriteriaRow>
        {filters.keyword ? (
          <CriteriaRow label="Industria">{labelOf(APOLLO_KEYWORDS, filters.keyword)}</CriteriaRow>
        ) : null}
        {filters.seniority ? (
          <CriteriaRow label="Nivel">{labelOf(APOLLO_SENIORITIES, filters.seniority)}</CriteriaRow>
        ) : null}
        {filters.company ? <CriteriaRow label="Empresa">{filters.company}</CriteriaRow> : null}
        {sizeLabels.length ? <CriteriaRow label="Tamaño">{sizeLabels.join(", ")}</CriteriaRow> : null}
        <CriteriaRow label="Lote">{filters.perPage} contactos con móvil y correo</CriteriaRow>
      </dl>

      <dl className="smart-criteria__list smart-criteria__list--insight">
        <CriteriaRow label="Rol de compra">
          {insight?.buying_role ?? "Sin señal"}
          <span className="smart-criteria__why" title={insight?.buying_role_reason}>
            {insight?.buying_role_reason}
          </span>
        </CriteriaRow>
        <CriteriaRow label="Señal de necesidad">
          {needSignals.length ? needSignals.join(", ") : "No se menciona"}
        </CriteriaRow>
        <CriteriaRow label="Solución sugerida">
          {insight?.suggested_solution ?? "Por definir"}
          <span className="smart-criteria__why" title={insight?.suggested_solution_reason}>
            {insight?.suggested_solution_reason}
          </span>
        </CriteriaRow>
      </dl>

      <div className="smart-criteria__actions">
        <button type="button" className="btn-primary" onClick={onSearch} disabled={disabled}>
          Buscar en Apollo
        </button>
        <button type="button" className="btn-secondary" onClick={onAdjust} disabled={disabled}>
          Ajustar filtros
        </button>
        <button type="button" className="btn-link" onClick={onDismiss} disabled={disabled}>
          Descartar
        </button>
      </div>
      <p className="text-micro smart-search-hint">
        Buscar gasta créditos al revelar móvil y correo. Ajustar solo pasa los criterios al panel de filtros.
      </p>
    </section>
  );
}

export function SmartSearchPanel({ disabled, onApply, onSearch }: SmartSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<SmartSearchResult | null>(null);
  const [panelFeedback, setPanelFeedback] = useState<{
    tone: FeedbackTone;
    title?: string;
    message: string;
  } | null>(null);
  const [iaReady, setIaReady] = useState<boolean | null>(null);
  const [iaModel, setIaModel] = useState("");

  useEffect(() => {
    fetch("/api/prospeccion/smart-search")
      .then((r) => r.json())
      .then((d) => {
        setIaReady(Boolean(d.ok));
        setIaModel(d.model ?? "");
      })
      .catch(() => setIaReady(false));
  }, []);

  const appendTranscript = (text: string) => {
    if (!text) return;
    setQuery((prev) => (prev ? `${prev.trim()} ${text}` : text));
  };

  const { supported, listening, error: micError, toggle } = useSpeechRecognition(appendTranscript);

  async function analyze() {
    const trimmed = query.trim();
    if (trimmed.length < 4) {
      setPanelFeedback({
        tone: "warning",
        title: "Consulta muy corta",
        message: "Escribe o dicta al menos 4 caracteres describiendo tu persona objetivo.",
      });
      return;
    }

    setLoading(true);
    setPanelFeedback(null);
    setPending(null);

    try {
      const res = await fetch("/api/prospeccion/smart-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "Error al interpretar la búsqueda");
      }
      // No se busca todavía: el vendedor revisa los criterios y decide si gasta créditos.
      setPending(data as SmartSearchResult);
    } catch (e) {
      setPanelFeedback({
        tone: "error",
        title: "Búsqueda inteligente fallida",
        message: e instanceof Error ? e.message : "Error de búsqueda inteligente",
      });
    } finally {
      setLoading(false);
    }
  }

  async function confirmSearch() {
    if (!pending) return;
    const result = pending;
    setPending(null);
    await onSearch(result);
  }

  async function adjustFilters() {
    if (!pending) return;
    const result = pending;
    setPending(null);
    await onApply(result);
    setPanelFeedback({
      tone: "info",
      title: "Criterios en el panel de filtros",
      message: "Ajusta lo que necesites y pulsa Buscar cuando estés listo.",
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !loading) void analyze();
    }
  }

  const busy = Boolean(disabled) || loading;

  return (
    <div className="smart-search-panel mb-4">
      <div className="smart-search-header">
        <div className="smart-search-header__label">
          <FieldLabel className="!mb-0">Búsqueda inteligente</FieldLabel>
          {iaReady === true && (
            <span className="smart-search-ia-badge" title="Mistral conectado">
              IA · {iaModel || "Mistral"}
            </span>
          )}
          {iaReady === false && (
            <span className="smart-search-ia-badge smart-search-ia-badge--warn">
              Modo básico
            </span>
          )}
        </div>
        {supported && (
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            className={`dictate-btn ${listening ? "dictate-btn--active" : ""}`}
            title="Dictar por voz"
          >
            <span className="dictate-btn__dot" aria-hidden />
            {listening ? "Escuchando…" : "Dictar"}
          </button>
        )}
      </div>

      <textarea
        className="input-field smart-search-textarea resize-y"
        placeholder="Ej: Líder de proyectos o transformación digital o líderes de tecnología para implementar IA; empresas de más de 100 empleados en Colombia"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={busy}
        rows={4}
      />

      <div className="smart-search-actions">
        <button
          type="button"
          onClick={() => void analyze()}
          disabled={busy}
          className="btn-primary w-full disabled:opacity-60"
        >
          {loading ? "Interpretando con IA…" : pending ? "Volver a interpretar" : "Interpretar"}
        </button>
        <p className="text-micro smart-search-hint">
          Enter interpreta · Shift+Enter baja de línea · No gasta créditos hasta confirmar
        </p>
      </div>

      {pending ? (
        <InterpretedCriteria
          result={pending}
          disabled={busy}
          onSearch={() => void confirmSearch()}
          onAdjust={() => void adjustFilters()}
          onDismiss={() => setPending(null)}
        />
      ) : null}

      {(panelFeedback || micError) && (
        <div className="mt-2">
          {panelFeedback && (
            <ActionBanner
              compact
              tone={panelFeedback.tone}
              title={panelFeedback.title}
              message={panelFeedback.message}
              onDismiss={() => setPanelFeedback(null)}
            />
          )}
          {micError && !panelFeedback && (
            <ActionBanner compact tone="error" title="Micrófono" message={micError} />
          )}
        </div>
      )}
    </div>
  );
}
