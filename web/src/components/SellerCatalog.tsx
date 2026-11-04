"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Link2, Plus, Sparkles, Trash2 } from "lucide-react";
import { ActionBanner, FieldLabel } from "@/components/ui";
import { parseApiResponse } from "@/lib/parse-api-response";
import type { SellerSolution, SellerSolutionInput } from "@/lib/seller-solutions";
import type { SellerWebSource } from "@/lib/seller-web-sources";
import type { IACSolution } from "@/lib/iac-portfolio-knowledge";

type SuggestedGroup = {
  source: string;
  source_type: "archivo" | "web";
  source_url?: string;
  services: IACSolution[];
};

type CatalogResponse = {
  solutions?: SellerSolution[];
  suggestions?: SuggestedGroup[];
  error?: string;
};

type SourcesResponse = { sources?: SellerWebSource[]; source?: SellerWebSource; error?: string };

function ApolloBudgetSummary() {
  const [budget, setBudget] = useState<{ used: number; limit: number; remaining: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/stats", { cache: "no-store" })
      .then((response) => parseApiResponse<{ apollo?: { credits_this_month?: number; monthly_budget?: number; remaining?: number } }>(response))
      .then(({ data }) => {
        const apollo = data?.apollo;
        if (cancelled || apollo?.credits_this_month == null || apollo.monthly_budget == null) return;
        setBudget({
          used: apollo.credits_this_month,
          limit: apollo.monthly_budget,
          remaining: apollo.remaining ?? Math.max(0, apollo.monthly_budget - apollo.credits_this_month),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!budget) return <p className="text-micro mt-1">Crédito Apollo global: cargando…</p>;
  return (
    <p className="text-micro mt-1">
      Crédito Apollo global: {budget.used.toLocaleString("es-CO")} / {budget.limit.toLocaleString("es-CO")} usados · {budget.remaining.toLocaleString("es-CO")} disponibles.
    </p>
  );
}

type Draft = Pick<
  SellerSolutionInput,
  "name" | "summary" | "value_proposition" | "fit_roles" | "industries" | "talking_points" | "source_label"
>;

const EMPTY_DRAFT: Draft = {
  name: "",
  summary: "",
  value_proposition: "",
  fit_roles: [],
  industries: [],
  talking_points: [],
  source_label: "Creado en Perfil del vendedor",
};

function listToText(values: string[]) {
  return values.join(", ");
}

function textToList(value: string) {
  return value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function draftFromSolution(solution: Pick<IACSolution, "name" | "summary" | "fit_roles" | "industries" | "talking_points">, source: string): Draft {
  return {
    name: solution.name,
    summary: solution.summary,
    value_proposition: solution.talking_points[0] ?? "",
    fit_roles: solution.fit_roles,
    industries: solution.industries,
    talking_points: solution.talking_points,
    source_label: source,
  };
}

function editFromSolution(solution: SellerSolution): Draft {
  return {
    name: solution.name,
    summary: solution.summary,
    value_proposition: solution.value_proposition,
    fit_roles: solution.fit_roles,
    industries: solution.industries,
    talking_points: solution.talking_points,
    source_label: solution.source_label,
  };
}

function SolutionFields({
  draft,
  onChange,
  disabled,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  disabled: boolean;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => onChange({ ...draft, [key]: value });
  return (
    <div className="seller-catalog__fields">
      <label>
        <FieldLabel>Producto o servicio</FieldLabel>
        <input
          className="input-field"
          value={draft.name}
          onChange={(event) => set("name", event.target.value)}
          placeholder="Ej. Automatización de procesos"
          disabled={disabled}
        />
      </label>
      <label>
        <FieldLabel>Qué resuelve</FieldLabel>
        <textarea
          className="input-field"
          rows={2}
          value={draft.summary}
          onChange={(event) => set("summary", event.target.value)}
          placeholder="Problema o resultado que resuelve"
          disabled={disabled}
        />
      </label>
      <label>
        <FieldLabel>Valor principal</FieldLabel>
        <input
          className="input-field"
          value={draft.value_proposition}
          onChange={(event) => set("value_proposition", event.target.value)}
          placeholder="Argumento comercial breve"
          disabled={disabled}
        />
      </label>
      <div className="knowledge-grid">
        <label>
          <FieldLabel>Cargos objetivo</FieldLabel>
          <input
            className="input-field"
            value={listToText(draft.fit_roles)}
            onChange={(event) => set("fit_roles", textToList(event.target.value))}
            placeholder="CEO, Director de operaciones"
            disabled={disabled}
          />
        </label>
        <label>
          <FieldLabel>Sectores</FieldLabel>
          <input
            className="input-field"
            value={listToText(draft.industries)}
            onChange={(event) => set("industries", textToList(event.target.value))}
            placeholder="Manufactura, retail"
            disabled={disabled}
          />
        </label>
      </div>
      <label>
        <FieldLabel>Fuente de referencia</FieldLabel>
        <input
          className="input-field"
          value={draft.source_label}
          onChange={(event) => set("source_label", event.target.value)}
          placeholder="Archivo, URL o creado manualmente"
          disabled={disabled}
        />
      </label>
    </div>
  );
}

function WebSources({ onCatalogChanged }: { onCatalogChanged: () => Promise<void> }) {
  const [sources, setSources] = useState<SellerWebSource[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);

  async function reload() {
    const response = await fetch("/api/perfil-vendedor/fuentes", { cache: "no-store" });
    const { data, error } = await parseApiResponse<SourcesResponse>(response);
    if (error || data?.error) throw new Error(error ?? data?.error ?? "No se pudieron cargar las URLs.");
    setSources(data?.sources ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/perfil-vendedor/fuentes", { cache: "no-store" })
      .then((response) => parseApiResponse<SourcesResponse>(response))
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || data?.error) {
          setMessage({
            tone: "error",
            text: error ?? data?.error ?? "No se pudieron cargar las URLs.",
          });
          return;
        }
        setSources(data?.sources ?? []);
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage({
            tone: "error",
            text: error instanceof Error ? error.message : "No se pudieron cargar las URLs.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function analyze() {
    if (!url.trim()) {
      setMessage({ tone: "error", text: "Escribe la URL pública que quieres analizar." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/perfil-vendedor/fuentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const { data, error } = await parseApiResponse<SourcesResponse>(response);
      if (error || data?.error) throw new Error(error ?? data?.error ?? "No se pudo analizar la URL.");
      setUrl("");
      await Promise.all([reload(), onCatalogChanged()]);
      setMessage({ tone: "success", text: "La URL quedó analizada. Revisa las propuestas antes de agregarlas al catálogo." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "No se pudo analizar la URL." });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(source: SellerWebSource) {
    setBusy(true);
    try {
      const response = await fetch(`/api/perfil-vendedor/fuentes/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !source.active }),
      });
      const { data, error } = await parseApiResponse<SourcesResponse>(response);
      if (error || data?.error) throw new Error(error ?? data?.error ?? "No se pudo actualizar la URL.");
      await Promise.all([reload(), onCatalogChanged()]);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "No se pudo actualizar la URL." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(source: SellerWebSource) {
    if (!window.confirm(`¿Eliminar «${source.label || source.source_url}»?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/perfil-vendedor/fuentes/${source.id}`, { method: "DELETE" });
      const { error } = await parseApiResponse<{ error?: string }>(response);
      if (error) throw new Error(error);
      await Promise.all([reload(), onCatalogChanged()]);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "No se pudo eliminar la URL." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="persona-card seller-catalog__sources">
      <summary className="persona-card__summary">
        <span className="persona-card__text">
          <span className="persona-card__name">URL pública de referencia</span>
          <span className="persona-card__value">Analiza una página pública sin recorrer enlaces, accesos privados ni captchas.</span>
        </span>
        <ChevronDown className="knowledge-fold__chevron" size={16} strokeWidth={1.75} aria-hidden />
      </summary>
      <div className="persona-card__body">
        {message ? <ActionBanner compact tone={message.tone} message={message.text} onDismiss={() => setMessage(null)} /> : null}
        <div className="seller-catalog__url-row">
          <input
            className="input-field"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://ejemplo.com/servicios"
            disabled={busy}
            aria-label="URL pública de referencia"
          />
          <button type="button" className="btn-secondary" onClick={() => void analyze()} disabled={busy}>
            <Link2 size={14} strokeWidth={1.5} aria-hidden />
            {busy ? "Analizando…" : "Analizar URL"}
          </button>
        </div>
        {sources.length > 0 ? (
          <ul className="seller-catalog__source-list">
            {sources.map((source) => (
              <li key={source.id} className={source.active ? "" : "seller-catalog__source--off"}>
                <div>
                  <p className="text-body-strong">{source.label || source.source_url}</p>
                  <p className="text-micro break-all">{source.source_url}</p>
                  {source.summary ? <p className="text-caption">{source.summary}</p> : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" className="btn-secondary" onClick={() => void toggle(source)} disabled={busy}>
                    {source.active ? "Pausar" : "Activar"}
                  </button>
                  <button type="button" className="knowledge-doc__delete" onClick={() => void remove(source)} disabled={busy} aria-label={`Eliminar ${source.label || source.source_url}`}>
                    <Trash2 size={14} strokeWidth={1.75} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-micro mt-3">Aún no hay URLs analizadas.</p>
        )}
      </div>
    </details>
  );
}

export function SellerCatalog({ referenceVersion = "" }: { referenceVersion?: string }) {
  const [solutions, setSolutions] = useState<SellerSolution[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedGroup[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<Record<number, Draft>>({});
  const [busy, setBusy] = useState<number | "new" | "suggestion" | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);

  async function reload() {
    const response = await fetch("/api/perfil-vendedor/soluciones", { cache: "no-store" });
    const { data, error } = await parseApiResponse<CatalogResponse>(response);
    if (error || data?.error) throw new Error(error ?? data?.error ?? "No se pudo cargar el catálogo.");
    setSolutions(data?.solutions ?? []);
    setSuggestions(data?.suggestions ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/perfil-vendedor/soluciones", { cache: "no-store" })
      .then((response) => parseApiResponse<CatalogResponse>(response))
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || data?.error) {
          setMessage({
            tone: "error",
            text: error ?? data?.error ?? "No se pudo cargar el catálogo.",
          });
          return;
        }
        setSolutions(data?.solutions ?? []);
        setSuggestions(data?.suggestions ?? []);
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage({
            tone: "error",
            text: error instanceof Error ? error.message : "No se pudo cargar el catálogo.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [referenceVersion]);

  async function create(next: Draft, sourceMessage?: string) {
    setBusy(sourceMessage ? "suggestion" : "new");
    setMessage(null);
    try {
      const response = await fetch("/api/perfil-vendedor/soluciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const { data, error } = await parseApiResponse<{ solution?: SellerSolution; error?: string }>(response);
      if (error || data?.error) throw new Error(error ?? data?.error ?? "No se pudo guardar el producto o servicio.");
      setDraft(EMPTY_DRAFT);
      await reload();
      setMessage({ tone: "success", text: sourceMessage ?? "El producto o servicio quedó confirmado y ya puede usarse en Búsqueda inteligente." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "No se pudo guardar el producto o servicio." });
    } finally {
      setBusy(null);
    }
  }

  async function save(solution: SellerSolution) {
    const next = editing[solution.id] ?? editFromSolution(solution);
    setBusy(solution.id);
    setMessage(null);
    try {
      const response = await fetch(`/api/perfil-vendedor/soluciones/${solution.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const { data, error } = await parseApiResponse<{ solution?: SellerSolution; error?: string }>(response);
      if (error || data?.error) throw new Error(error ?? data?.error ?? "No se pudo guardar la solución.");
      setEditing((current) => {
        const copy = { ...current };
        delete copy[solution.id];
        return copy;
      });
      await reload();
      setMessage({ tone: "success", text: "Solución actualizada." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "No se pudo guardar la solución." });
    } finally {
      setBusy(null);
    }
  }

  async function toggle(solution: SellerSolution) {
    setBusy(solution.id);
    try {
      const response = await fetch(`/api/perfil-vendedor/soluciones/${solution.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !solution.active }),
      });
      const { data, error } = await parseApiResponse<{ solution?: SellerSolution; error?: string }>(response);
      if (error || data?.error) throw new Error(error ?? data?.error ?? "No se pudo actualizar la solución.");
      await reload();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "No se pudo actualizar la solución." });
    } finally {
      setBusy(null);
    }
  }

  async function remove(solution: SellerSolution) {
    if (!window.confirm(`¿Eliminar «${solution.name}» del catálogo confirmado?`)) return;
    setBusy(solution.id);
    try {
      const response = await fetch(`/api/perfil-vendedor/soluciones/${solution.id}`, { method: "DELETE" });
      const { error } = await parseApiResponse<{ error?: string }>(response);
      if (error) throw new Error(error);
      await reload();
      setMessage({ tone: "success", text: "Solución eliminada." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "No se pudo eliminar la solución." });
    } finally {
      setBusy(null);
    }
  }

  const activeCount = solutions.filter((solution) => solution.active).length;

  return (
    <section className="knowledge-card seller-catalog">
      <div className="knowledge-docs-head">
        <div>
          <div className="page-heading">
            <p className="knowledge-card__title">Productos y servicios que vendes</p>
          </div>
          <p className="text-caption mt-1">Solo los productos confirmados aquí alimentan Búsqueda inteligente y Mensaje IA.</p>
          <ApolloBudgetSummary />
        </div>
        <ul className="knowledge-kpis" aria-label="Resumen del catálogo">
          <li>
            <strong>{activeCount}</strong>
            <span>activo{activeCount === 1 ? "" : "s"}</span>
          </li>
          <li>
            <strong>{solutions.length}</strong>
            <span>confirmado{solutions.length === 1 ? "" : "s"}</span>
          </li>
        </ul>
      </div>

      {message ? <ActionBanner compact tone={message.tone} message={message.text} onDismiss={() => setMessage(null)} /> : null}

      {loading ? (
        <div className="kpi-skeleton mt-4 h-24" />
      ) : (
        <>
          <details className="persona-card persona-card--new mt-4">
            <summary className="persona-card__summary">
              <span className="persona-card__text">
                <span className="persona-card__name">Agregar producto o servicio</span>
                <span className="persona-card__value">Define la oferta que el motor podrá activar.</span>
              </span>
              <Plus size={16} strokeWidth={1.75} aria-hidden />
            </summary>
            <div className="persona-card__body">
              <SolutionFields draft={draft} onChange={setDraft} disabled={busy !== null} />
              <button type="button" className="btn-primary mt-3" onClick={() => void create(draft)} disabled={busy !== null || !draft.name.trim()}>
                {busy === "new" ? "Guardando…" : "Confirmar producto o servicio"}
              </button>
            </div>
          </details>

          <WebSources onCatalogChanged={reload} />

          {suggestions.length > 0 ? (
            <details className="persona-card seller-catalog__suggestions">
              <summary className="persona-card__summary">
                <span className="persona-card__text">
                  <span className="persona-card__name">Propuestas extraídas de tus fuentes</span>
                  <span className="persona-card__value">La plataforma propone. Tú decides qué entra al catálogo.</span>
                </span>
                <Sparkles size={16} strokeWidth={1.75} aria-hidden />
              </summary>
              <div className="persona-card__body">
                {suggestions.flatMap((group) =>
                  group.services.map((service, index) => (
                    <article className="seller-catalog__suggestion" key={`${group.source}-${service.id}-${index}`}>
                      <div>
                        <p className="text-body-strong">{service.name}</p>
                        <p className="text-caption">{service.summary}</p>
                        <p className="text-micro">Fuente: {group.source}</p>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={busy !== null}
                        onClick={() => void create(draftFromSolution(service, group.source), `«${service.name}» quedó confirmado en tu catálogo.`)}
                      >
                        {busy === "suggestion" ? "Agregando…" : "Agregar"}
                      </button>
                    </article>
                  ))
                )}
              </div>
            </details>
          ) : null}

          {solutions.length === 0 ? (
            <p className="text-micro mt-4">No hay oferta confirmada. Agrega una manualmente o analiza un archivo o URL para revisar propuestas.</p>
          ) : (
            <ul className="seller-catalog__list">
              {solutions.map((solution) => {
                const current = editing[solution.id] ?? editFromSolution(solution);
                return (
                  <li key={solution.id} className={solution.active ? "" : "seller-catalog__solution--off"}>
                    <details className="persona-card">
                      <summary className="persona-card__summary">
                        <span className="persona-card__text">
                          <span className="persona-card__name">{solution.name}</span>
                          <span className="persona-card__value">{solution.summary || solution.value_proposition || "Sin resumen"}</span>
                          <span className="text-micro">{solution.active ? "Activa para búsqueda" : "Pausada"} · {solution.source_label}</span>
                        </span>
                        <ChevronDown className="knowledge-fold__chevron" size={16} strokeWidth={1.75} aria-hidden />
                      </summary>
                      <div className="persona-card__body">
                        <SolutionFields
                          draft={current}
                          disabled={busy !== null}
                          onChange={(next) => setEditing((all) => ({ ...all, [solution.id]: next }))}
                        />
                        <div className="persona-card__actions">
                          <div className="flex gap-2">
                            <button type="button" className="btn-primary" onClick={() => void save(solution)} disabled={busy !== null}>
                              {busy === solution.id ? "Guardando…" : "Guardar"}
                            </button>
                            <button type="button" className="btn-secondary" onClick={() => void toggle(solution)} disabled={busy !== null}>
                              {solution.active ? "Pausar" : "Activar"}
                            </button>
                          </div>
                          <button type="button" className="knowledge-doc__delete" onClick={() => void remove(solution)} disabled={busy !== null} aria-label={`Eliminar ${solution.name}`}>
                            <Trash2 size={14} strokeWidth={1.75} />
                          </button>
                        </div>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
