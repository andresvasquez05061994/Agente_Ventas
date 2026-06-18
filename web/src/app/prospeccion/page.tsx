"use client";

import { useState } from "react";
import type { ApolloPerson } from "@/lib/types";
import type { SmartSearchFilters, SmartSearchResult } from "@/lib/smart-search";
import { ApolloSearchFilters } from "@/components/ApolloSearchFilters";
import { SmartSearchPanel } from "@/components/SmartSearchPanel";
import { ActionBanner, FeedbackAnchor } from "@/components/ui";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import {
  DEFAULT_SEARCH,
  explainEmptySearchMessage,
} from "@/lib/apollo-filters";

type SearchStatus = "idle" | "loading" | "success" | "empty" | "error";

type SearchParams = {
  country: string;
  titles: string[];
  keyword: string;
  seniority: string;
  company: string;
  perPage: number;
};

export default function ProspeccionPage() {
  const [country, setCountry] = useState(DEFAULT_SEARCH.country);
  const [company, setCompany] = useState(DEFAULT_SEARCH.company);
  const [titles, setTitles] = useState<string[]>(DEFAULT_SEARCH.titles);
  const [keyword, setKeyword] = useState(DEFAULT_SEARCH.keyword);
  const [seniority, setSeniority] = useState(DEFAULT_SEARCH.seniority);
  const [perPage, setPerPage] = useState(DEFAULT_SEARCH.perPage);

  const [results, setResults] = useState<ApolloPerson[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [saving, setSaving] = useState(false);
  const { feedback, showSuccess, showError, showWarning, showInfo, clear } = useActionFeedback();
  const [meta, setMeta] = useState<{
    total_entries: number;
    with_contact_data?: number;
    scanned_profiles?: number;
    apollo_zero_results?: boolean;
    webhook_configured?: boolean;
    organization_name?: string;
    industry_relaxed?: boolean;
    credits_consumed?: number;
    enrich_stats?: {
      candidates?: number;
      matched?: number;
      with_email?: number;
      with_phone?: number;
      with_both?: number;
    };
  } | null>(null);

  function toggleTitle(value: string) {
    setTitles((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]
    );
  }

  function applyFilters(filters: SmartSearchFilters) {
    setCountry(filters.country);
    setCompany(filters.company);
    setTitles(filters.titles);
    setKeyword(filters.keyword);
    setSeniority(filters.seniority);
    setPerPage(filters.perPage);
  }

  async function search(overrides?: Partial<SearchParams>) {
    const params: SearchParams = {
      country: overrides?.country ?? country,
      titles: overrides?.titles ?? titles,
      keyword: overrides?.keyword ?? keyword,
      seniority: overrides?.seniority ?? seniority,
      company: overrides?.company ?? company,
      perPage: overrides?.perPage ?? perPage,
    };

    if (!params.titles.length) {
      setStatus("error");
      showWarning("Selecciona o agrega al menos un cargo antes de buscar.", "Filtros incompletos");
      return;
    }

    if (!overrides) {
      setCountry(params.country);
      setCompany(params.company);
      setTitles(params.titles);
      setKeyword(params.keyword);
      setSeniority(params.seniority);
      setPerPage(params.perPage);
    }

    setStatus("loading");
    clear();
    setResults([]);

    try {
      const res = await fetch("/api/apollo/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: params.country,
          titles: params.titles,
          keyword: params.keyword,
          seniority: params.seniority,
          company: params.company.trim() || undefined,
          per_page: params.perPage,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `Error del servidor (${res.status})`);
      }

      const list: ApolloPerson[] = data.results ?? [];
      setResults(list);
      setMeta(data.meta ?? null);
      setSelected(new Set());

      if (list.length === 0) {
        setStatus("empty");
        showWarning(
          explainEmptySearchMessage(data.meta, Boolean(params.seniority?.trim())),
          "Sin contactos completos"
        );
      } else {
        setStatus("success");
        const credits = data.meta?.credits_consumed ?? 0;
        const relaxed = data.meta?.industry_relaxed
          ? " Industria ampliada con término alternativo en Apollo."
          : "";
        const org = params.company.trim() ? ` Empresa: ${params.company.trim()}.` : "";
        showSuccess(
          `${list.length} contacto(s) con email y teléfono · ${data.meta?.total_entries ?? 0} coincidencias en Apollo` +
            (credits > 0 ? ` · ${credits} crédito(s) usados` : "") +
            org +
            relaxed,
          "Búsqueda completada"
        );
      }
    } catch (e) {
      setStatus("error");
      showError(e instanceof Error ? e.message : "Error de búsqueda", "Búsqueda fallida");
      setResults([]);
      setMeta(null);
    }
  }

  async function handleSmartApply(result: SmartSearchResult) {
    applyFilters(result.filters);
    showInfo(result.summary, "Filtros interpretados");
    await search(result.filters);
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function selectAll() {
    setSelected(new Set(results.map((r) => r.apollo_id)));
  }

  async function save() {
    const toSave = results.filter((r) => selected.has(r.apollo_id));
    if (!toSave.length) {
      showWarning("Marca al menos un contacto en la tabla antes de guardar.", "Nada seleccionado");
      return;
    }

    const incomplete = toSave.filter((r) => !r.email?.trim() || !r.telefono?.trim());
    if (incomplete.length) {
      showError(
        `${incomplete.length} contacto(s) sin email o teléfono. Solo se guardan contactos completos.`,
        "Datos incompletos"
      );
      return;
    }

    const fuente = [
      country,
      company.trim() || null,
      titles.join(", "),
      keyword || null,
      seniority || null,
    ]
      .filter(Boolean)
      .join(" | ");

    setSaving(true);
    clear();

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: toSave, fuente }),
      });
      const data = await res.json();
      if (data.error) {
        showError(data.error, "No se guardó en portafolio");
      } else {
        const parts = [`${data.inserted} nuevo(s)`];
        if (data.updated) parts.push(`${data.updated} actualizado(s)`);
        if (data.skipped) parts.push(`${data.skipped} omitido(s)`);
        showSuccess(
          `${parts.join(", ")} con email y teléfono verificados. Puedes revisarlos en Portafolio.`,
          "Guardado en portafolio"
        );
        setSelected(new Set());
      }
    } catch {
      showError("Error de red al guardar. Intenta de nuevo.", "No se guardó en portafolio");
    } finally {
      setSaving(false);
    }
  }

  const filterProps = {
    country,
    setCountry,
    company,
    setCompany,
    titles,
    setTitles,
    toggleTitle,
    keyword,
    setKeyword,
    seniority,
    setSeniority,
    perPage,
    setPerPage,
    loading: status === "loading" || saving,
    onSearch: () => search(),
  };

  const busy = status === "loading" || saving;

  return (
    <div className="flex w-full flex-1">
      <aside className="filter-sidebar hidden w-[280px] shrink-0 border-r border-[#E2E6EA] bg-[#FAFBFC] dark:border-[#2A3544] dark:bg-[#151B23] lg:block">
        <SmartSearchPanel disabled={busy} onApply={handleSmartApply} />
        <ApolloSearchFilters {...filterProps} />
      </aside>

      <main className="min-w-0 flex-1 p-5 lg:p-7">
        <div className="page-header">
          <h1 className="page-title">Prospección</h1>
        </div>

        <div className="mt-4 lg:hidden">
          <SmartSearchPanel disabled={busy} onApply={handleSmartApply} />
          <ApolloSearchFilters {...filterProps} />
        </div>

        {feedback && (
          <FeedbackAnchor>
            <ActionBanner {...feedback} onDismiss={clear} />
          </FeedbackAnchor>
        )}

        {status === "loading" && (
          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#003A70] border-t-transparent dark:border-[#4A8FD4] dark:border-t-transparent" />
            <p className="text-caption">
              Buscando en Apollo y enriqueciendo email/teléfono…
              <br />
              <span className="text-micro">Puede tardar hasta 1 minuto.</span>
            </p>
          </div>
        )}

        {status === "idle" && !feedback && (
          <div className="mt-10 flex min-h-[240px] flex-col items-center justify-center text-center">
            <p className="text-body-strong mb-2">Listo para buscar</p>
            <p className="text-caption max-w-md">
              Usa búsqueda inteligente por texto o voz, indica una empresa opcional, o ajusta
              los filtros manualmente. Solo verás contactos con email y teléfono confirmados.
            </p>
          </div>
        )}

        {results.length > 0 && status !== "loading" && (
          <>
            <div className="text-body mt-4 flex flex-wrap items-center gap-2">
              <span>{meta?.total_entries ?? results.length} en Apollo</span>
              <span className="text-[#C8D0D8]">·</span>
              <span>{selected.size} seleccionados</span>
              <button type="button" onClick={selectAll} className="btn-link" disabled={busy}>
                Seleccionar todos
              </button>
            </div>
            <div className="mt-3 overflow-x-auto rounded border border-[#E2E6EA] dark:border-[#2A3544]">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Sel.</th>
                    <th>Nombre</th>
                    <th>Cargo</th>
                    <th>Empresa</th>
                    <th>Email</th>
                    <th>Teléfono</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.apollo_id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(r.apollo_id)}
                          onChange={() => toggle(r.apollo_id)}
                          disabled={busy}
                        />
                      </td>
                      <td className="cell-strong">{r.nombre}</td>
                      <td>{r.cargo ?? "—"}</td>
                      <td>{r.empresa ?? "—"}</td>
                      <td>{r.email}</td>
                      <td>{r.telefono}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || selected.size === 0}
              className="btn-primary mt-4 disabled:opacity-60"
            >
              {saving
                ? "Guardando en portafolio…"
                : selected.size > 0
                  ? `Guardar en portafolio (${selected.size})`
                  : "Guardar en portafolio"}
            </button>
          </>
        )}
      </main>
    </div>
  );
}
