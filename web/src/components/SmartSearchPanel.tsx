"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { SmartSearchResult } from "@/lib/smart-search";
import {
  APOLLO_COUNTRIES,
  APOLLO_EMPLOYEE_RANGES,
  APOLLO_KEYWORDS,
  APOLLO_SENIORITIES,
} from "@/lib/apollo-filters";
import { ActionBanner, FieldLabel, type FeedbackTone } from "@/components/ui";
import { parseApiResponse } from "@/lib/parse-api-response";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

type SmartSearchPanelProps = {
  disabled?: boolean;
  /** Solo se ejecuta después de la confirmación explícita del vendedor. */
  onSearch: (result: SmartSearchResult) => void | Promise<void>;
};

type SellerSolutionBrief = {
  id: number;
  name: string;
  summary: string;
  active: boolean;
};

type CompanyMatch = {
  id: number;
  legal_name: string;
  source_label: string;
  employee_count: number;
  size: "Mediana" | "Grande";
  economic_activity: string | null;
  city: string | null;
  reasons: string[];
};

type Budget = {
  credits_this_month?: number;
  monthly_budget?: number;
  remaining?: number;
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

function CriteriaSummary({ result }: { result: SmartSearchResult }) {
  const { filters, insight } = result;
  const sizeLabels = (filters.employeeRanges ?? []).map((range) =>
    labelOf(APOLLO_EMPLOYEE_RANGES, range)
  );

  return (
    <>
      <dl className="smart-criteria__list">
        <CriteriaRow label="Solución activada">
          <span className="smart-criteria__chips">
            {result.selected_solutions.map((solution) => (
              <span key={solution.id} className="smart-criteria__chip">
                {solution.name}
              </span>
            ))}
          </span>
        </CriteriaRow>
        <CriteriaRow label="País">{labelOf(APOLLO_COUNTRIES, filters.country)}</CriteriaRow>
        <CriteriaRow label="Cargos">
          <span className="smart-criteria__chips">
            {filters.titles.map((title) => (
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
        {filters.company ? <CriteriaRow label="Cuenta">{filters.company}</CriteriaRow> : null}
        {sizeLabels.length ? <CriteriaRow label="Tamaño">{sizeLabels.join(", ")}</CriteriaRow> : null}
        <CriteriaRow label="Lote">{filters.perPage} contactos con móvil y correo</CriteriaRow>
      </dl>

      <dl className="smart-criteria__list smart-criteria__list--insight">
        <CriteriaRow label="Tipo de contacto">
          {insight.buying_role ?? "Sin señal"}
          <span className="smart-criteria__why" title={insight.buying_role_reason}>
            {insight.buying_role_reason}
          </span>
        </CriteriaRow>
        <CriteriaRow label="Señal de necesidad">
          {insight.need_signals.length ? insight.need_signals.join(", ") : "No se menciona"}
        </CriteriaRow>
        <CriteriaRow label="Solución sugerida">
          {insight.suggested_solution ?? "Por definir"}
          <span className="smart-criteria__why" title={insight.suggested_solution_reason}>
            {insight.suggested_solution_reason}
          </span>
        </CriteriaRow>
      </dl>
    </>
  );
}

function InterpretedCriteria({
  result,
  disabled,
  onContinue,
  onDismiss,
}: {
  result: SmartSearchResult;
  disabled: boolean;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  return (
    <section className="smart-criteria" aria-label="Criterios interpretados">
      <header className="smart-criteria__head">
        <p className="smart-criteria__title">Criterios interpretados</p>
        <span className="smart-search-ia-badge">
          {result.source === "mistral" ? `IA · ${result.model ?? "Mistral"}` : "Modo básico"}
        </span>
      </header>
      <CriteriaSummary result={result} />
      <div className="smart-criteria__actions">
        <button type="button" className="btn-primary" onClick={onContinue} disabled={disabled}>
          Revisar consumo y confirmar
        </button>
        <button type="button" className="btn-link" onClick={onDismiss} disabled={disabled}>
          Descartar
        </button>
      </div>
      <p className="text-micro smart-search-hint">
        Interpretar no usa créditos. Apollo se consulta solo después de confirmar.
      </p>
    </section>
  );
}

function SearchConfirmation({
  result,
  budget,
  loading,
  disabled,
  onBack,
  onConfirm,
}: {
  result: SmartSearchResult;
  budget: Budget | null;
  loading: boolean;
  disabled: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const used = budget?.credits_this_month;
  const limit = budget?.monthly_budget;
  const remaining = budget?.remaining;

  return (
    <section className="smart-search-confirmation" aria-label="Confirmación de consulta Apollo">
      <p className="section-label">Confirmación</p>
      <h3 className="smart-search-confirmation__title">Revisa antes de consultar Apollo</h3>
      <p className="text-caption">
        Los contactos se consultarán con las soluciones y criterios de abajo. La consulta no se ejecuta hasta pulsar Confirmar.
      </p>
      <div className="smart-search-confirmation__list">
        <CriteriaSummary result={result} />
      </div>
      <div className="smart-search-confirmation__budget">
        {loading ? (
          <p className="text-micro">Consultando el consumo global de Apollo…</p>
        ) : used != null && limit != null ? (
          <>
            <p className="text-body-strong">
              Crédito global: {used.toLocaleString("es-CO")} / {limit.toLocaleString("es-CO")}
            </p>
            <p className="text-micro">
              {remaining != null ? `${remaining.toLocaleString("es-CO")} disponibles este mes.` : ""} El costo final no puede verificarse hasta que Apollo revele los datos de contacto.
            </p>
          </>
        ) : (
          <p className="text-micro">No se pudo cargar el consumo actual. Puedes volver a revisar o cancelar.</p>
        )}
      </div>
      <div className="smart-criteria__actions">
        <button type="button" className="btn-primary" onClick={onConfirm} disabled={disabled || loading}>
          Confirmar consulta en Apollo
        </button>
        <button type="button" className="btn-secondary" onClick={onBack} disabled={disabled}>
          Volver a criterios
        </button>
      </div>
    </section>
  );
}

export function SmartSearchPanel({ disabled, onSearch }: SmartSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [solutions, setSolutions] = useState<SellerSolutionBrief[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [matches, setMatches] = useState<CompanyMatch[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<CompanyMatch | null>(null);
  const [loadingSolutions, setLoadingSolutions] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingBudget, setLoadingBudget] = useState(false);
  const [pending, setPending] = useState<SmartSearchResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [panelFeedback, setPanelFeedback] = useState<{
    tone: FeedbackTone;
    title?: string;
    message: string;
  } | null>(null);
  const [iaReady, setIaReady] = useState<boolean | null>(null);
  const [iaModel, setIaModel] = useState("");

  const selectedKey = useMemo(() => [...selectedIds].sort((a, b) => a - b).join(","), [selectedIds]);
  const activeSolutions = solutions.filter((solution) => solution.active);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/perfil-vendedor/soluciones", { cache: "no-store" })
        .then((response) => parseApiResponse<{ solutions?: SellerSolutionBrief[]; error?: string }>(response))
        .then(({ data, error }) => {
          if (error || data?.error) throw new Error(error ?? data?.error ?? "No se pudo cargar tu catálogo.");
          if (!cancelled) setSolutions(data?.solutions ?? []);
        }),
      fetch("/api/prospeccion/smart-search")
        .then((response) => parseApiResponse<{ ok?: boolean; model?: string }>(response))
        .then(({ data }) => {
          if (!cancelled) {
            setIaReady(Boolean(data?.ok));
            setIaModel(data?.model ?? "");
          }
        })
        .catch(() => {
          if (!cancelled) setIaReady(false);
        }),
    ])
      .catch((error) => {
        if (!cancelled) {
          setPanelFeedback({
            tone: "error",
            title: "Catálogo no disponible",
            message: error instanceof Error ? error.message : "No se pudo cargar el catálogo confirmado.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSolutions(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedKey) return;
    let cancelled = false;
    const queryString = selectedKey
      .split(",")
      .map((id) => `solution_id=${encodeURIComponent(id)}`)
      .join("&");
    void fetch(`/api/busqueda-inteligente/empresas?${queryString}`, { cache: "no-store" })
      .then((response) => parseApiResponse<{ matches?: CompanyMatch[]; error?: string }>(response))
      .then(({ data, error }) => {
        if (error || data?.error) throw new Error(error ?? data?.error ?? "No se pudieron buscar las empresas.");
        if (!cancelled) {
          const next = data?.matches ?? [];
          setMatches(next);
          setSelectedCompany((current) =>
            current && next.some((match) => match.id === current.id) ? current : null
          );
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMatches([]);
          setPanelFeedback({
            tone: "error",
            title: "Cuentas no disponibles",
            message: error instanceof Error ? error.message : "No se pudieron buscar las cuentas compatibles.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMatches(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedKey]);

  const appendTranscript = (text: string) => {
    if (!text) return;
    setQuery((previous) => (previous ? `${previous.trim()} ${text}` : text));
  };

  const { supported, listening, error: micError, toggle } = useSpeechRecognition(appendTranscript);

  function toggleSolution(id: number) {
    setPending(null);
    setConfirming(false);
    setMatches([]);
    setSelectedCompany(null);
    const nextIds = selectedIds.includes(id)
      ? selectedIds.filter((value) => value !== id)
      : [...selectedIds, id];
    setLoadingMatches(nextIds.length > 0);
    setSelectedIds(nextIds);
  }

  async function analyze() {
    const trimmed = query.trim();
    if (!selectedIds.length) {
      setPanelFeedback({
        tone: "warning",
        title: "Elige una solución",
        message: "Selecciona al menos un producto o servicio confirmado antes de continuar.",
      });
      return;
    }
    if (trimmed.length < 4) {
      setPanelFeedback({
        tone: "warning",
        title: "Consulta muy corta",
        message: "Escribe o dicta al menos 4 caracteres describiendo los cargos o el mercado objetivo.",
      });
      return;
    }

    setLoading(true);
    setPanelFeedback(null);
    setPending(null);
    setConfirming(false);
    try {
      const response = await fetch("/api/prospeccion/smart-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, solution_ids: selectedIds }),
      });
      const { data, error } = await parseApiResponse<SmartSearchResult & { error?: string }>(response);
      if (error || data?.error || !data) {
        throw new Error(error ?? data?.error ?? "No se pudo interpretar la búsqueda.");
      }
      if (selectedCompany) {
        data.filters.company = selectedCompany.legal_name;
        data.summary = `${data.summary} · Cuenta elegida: ${selectedCompany.legal_name}`;
      }
      setPending(data);
    } catch (error) {
      setPanelFeedback({
        tone: "error",
        title: "Búsqueda inteligente fallida",
        message: error instanceof Error ? error.message : "No se pudo interpretar la búsqueda.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function openConfirmation() {
    if (!pending) return;
    setConfirming(true);
    setLoadingBudget(true);
    setBudget(null);
    try {
      const response = await fetch("/api/stats", { cache: "no-store" });
      const { data, error } = await parseApiResponse<{ apollo?: Budget; error?: string }>(response);
      if (error || data?.error) throw new Error(error ?? data?.error ?? "No se pudo cargar el consumo de Apollo.");
      setBudget(data?.apollo ?? null);
    } catch (error) {
      setPanelFeedback({
        tone: "warning",
        title: "Consumo sin actualizar",
        message: error instanceof Error ? error.message : "No se pudo cargar el consumo de Apollo.",
      });
    } finally {
      setLoadingBudget(false);
    }
  }

  async function confirmSearch() {
    if (!pending) return;
    const result = pending;
    setConfirming(false);
    setPending(null);
    await onSearch(result);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!disabled && !loading) void analyze();
    }
  }

  const busy = Boolean(disabled) || loading || loadingBudget || loadingMatches;

  return (
    <div className="smart-search-panel mb-4">
      <div className="smart-search-header">
        <div className="smart-search-header__label">
          <FieldLabel className="!mb-0">Búsqueda inteligente</FieldLabel>
          {iaReady === true ? (
            <span className="smart-search-ia-badge" title="Mistral conectado">
              IA · {iaModel || "Mistral"}
            </span>
          ) : iaReady === false ? (
            <span className="smart-search-ia-badge smart-search-ia-badge--warn">Modo básico</span>
          ) : null}
        </div>
        {supported ? (
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
        ) : null}
      </div>

      <section className="smart-search-solutions" aria-label="Soluciones activadas">
        <p className="text-caption">1. Activa el producto o servicio que vas a ofrecer.</p>
        {loadingSolutions ? (
          <div className="kpi-skeleton h-14" />
        ) : activeSolutions.length ? (
          <div className="smart-search-solutions__list">
            {activeSolutions.map((solution) => {
              const checked = selectedIds.includes(solution.id);
              return (
                <label
                  key={solution.id}
                  className={`smart-search-solutions__item${checked ? " smart-search-solutions__item--selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={busy}
                    onChange={() => toggleSolution(solution.id)}
                  />
                  <span>
                    <strong>{solution.name}</strong>
                    {solution.summary ? <small>{solution.summary}</small> : null}
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="text-caption">
            No hay productos o servicios activos. <Link className="btn-link" href="/perfil-vendedor">Defínelos en Perfil del vendedor</Link>.
          </p>
        )}
      </section>

      {selectedIds.length ? (
        <section className="smart-search-solutions smart-search-solutions--accounts" aria-label="Cuentas compatibles">
          <p className="text-caption">2. Opcional: elige una cuenta compatible de una base cargada.</p>
          {loadingMatches ? (
            <p className="text-micro">Buscando cuentas compatibles…</p>
          ) : matches.length ? (
            <div className="smart-search-solutions__list">
              {matches.slice(0, 5).map((match) => {
                const checked = selectedCompany?.id === match.id;
                return (
                  <label
                    key={match.id}
                    className={`smart-search-solutions__item${checked ? " smart-search-solutions__item--selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="smart-search-company"
                      checked={checked}
                      disabled={busy}
                      onChange={() => setSelectedCompany(match)}
                    />
                    <span>
                      <strong>{match.legal_name}</strong>
                      <small>
                        {match.size} · {match.employee_count.toLocaleString("es-CO")} empleados · {match.source_label}
                      </small>
                    </span>
                  </label>
                );
              })}
              {selectedCompany ? (
                <button type="button" className="btn-link" disabled={busy} onClick={() => setSelectedCompany(null)}>
                  Buscar sin limitar a una cuenta
                </button>
              ) : null}
            </div>
          ) : (
            <p className="text-micro">
              No hay cuentas compatibles en las bases cargadas. <Link className="btn-link" href="/enriquecer">Importa una base declarada</Link> para compararlas.
            </p>
          )}
        </section>
      ) : null}

      <div className="smart-search-query">
        <FieldLabel htmlFor="smart-search-query">3. Describe los cargos o el mercado objetivo</FieldLabel>
        <textarea
          id="smart-search-query"
          className="input-field smart-search-textarea resize-y"
          placeholder="Ej. Directores de operaciones y tecnología en Colombia para automatizar procesos"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={busy || !activeSolutions.length}
          rows={4}
        />
      </div>

      <div className="smart-search-actions">
        <button
          type="button"
          onClick={() => void analyze()}
          disabled={busy || !activeSolutions.length}
          className="btn-primary w-full disabled:opacity-60"
        >
          {loading ? "Interpretando con IA…" : pending ? "Volver a interpretar" : "Interpretar búsqueda"}
        </button>
        <p className="text-micro smart-search-hint">
          Enter interpreta · Shift+Enter baja de línea · No usa créditos hasta confirmar
        </p>
      </div>

      {pending && !confirming ? (
        <InterpretedCriteria
          result={pending}
          disabled={busy}
          onContinue={() => void openConfirmation()}
          onDismiss={() => setPending(null)}
        />
      ) : null}

      {pending && confirming ? (
        <SearchConfirmation
          result={pending}
          budget={budget}
          loading={loadingBudget}
          disabled={Boolean(disabled) || loading}
          onBack={() => setConfirming(false)}
          onConfirm={() => void confirmSearch()}
        />
      ) : null}

      {(panelFeedback || micError) ? (
        <div className="mt-2">
          {panelFeedback ? (
            <ActionBanner
              compact
              tone={panelFeedback.tone}
              title={panelFeedback.title}
              message={panelFeedback.message}
              onDismiss={() => setPanelFeedback(null)}
            />
          ) : null}
          {micError && !panelFeedback ? <ActionBanner compact tone="error" title="Micrófono" message={micError} /> : null}
        </div>
      ) : null}
    </div>
  );
}
