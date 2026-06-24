"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SmartSearchResult } from "@/lib/smart-search";
import { ApolloSearchFilters } from "@/components/ApolloSearchFilters";
import { SmartSearchPanel } from "@/components/SmartSearchPanel";
import { ActionBanner, FeedbackAnchor } from "@/components/ui";
import { useProspeccionSession } from "@/contexts/prospeccion-session";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { explainEmptySearchMessage } from "@/lib/apollo-filters";
import { parseApiResponse } from "@/lib/parse-api-response";

type SearchParams = {
  country: string;
  titles: string[];
  keyword: string;
  seniority: string;
  company: string;
  employeeRanges: string[];
  perPage: number;
};

export default function ProspeccionPage() {
  const router = useRouter();
  const session = useProspeccionSession();
  const {
    country,
    company,
    titles,
    keyword,
    seniority,
    employeeRanges,
    perPage,
    results,
    selected,
    status,
    meta,
    setCountry,
    setCompany,
    setTitles,
    setKeyword,
    setSeniority,
    setPerPage,
    setResults,
    setSelectedIds,
    setStatus,
    setMeta,
    toggleSelected,
    selectAllResults,
    removeResultsByIds,
    clearSession,
    applyFilters,
  } = session;

  const [saving, setSaving] = useState(false);
  const { feedback, showSuccess, showError, showWarning, showInfo, clear } = useActionFeedback();

  function toggleTitle(value: string) {
    setTitles(titles.includes(value) ? titles.filter((t) => t !== value) : [...titles, value]);
  }

  async function search(overrides?: Partial<SearchParams>) {
    const params: SearchParams = {
      country: overrides?.country ?? country,
      titles: overrides?.titles ?? titles,
      keyword: overrides?.keyword ?? keyword,
      seniority: overrides?.seniority ?? seniority,
      company: overrides?.company ?? company,
      employeeRanges: overrides?.employeeRanges ?? employeeRanges,
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
          employee_ranges: params.employeeRanges.length ? params.employeeRanges : undefined,
          per_page: params.perPage,
        }),
      });

      const { data, error: parseError } = await parseApiResponse<{
        results?: typeof results;
        meta?: typeof meta;
        error?: string;
      }>(res);

      if (parseError) {
        throw new Error(parseError);
      }
      if (!data) {
        throw new Error(`Error del servidor (${res.status})`);
      }
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `Error del servidor (${res.status})`);
      }

      const list = data.results ?? [];
      setResults(list);
      setMeta(data.meta ?? null);
      setSelectedIds([]);

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
        const skipped = data.meta?.portfolio_skipped
          ? ` ${data.meta.portfolio_skipped} perfil(es) ya en portafolio omitidos (sin gastar créditos).`
          : "";
        const countryFiltered =
          data.meta?.country_rejected && data.meta.country_rejected > 0
            ? ` ${data.meta.country_rejected} descartados por ubicación en otro país.`
            : "";
        showSuccess(
          `${list.length} contacto(s) con email y teléfono · ${data.meta?.total_entries ?? 0} coincidencias en Apollo` +
            (credits > 0 ? ` · ${credits} crédito(s) usados` : "") +
            org +
            skipped +
            countryFiltered +
            relaxed +
            (data.meta?.timed_out
              ? " Tiempo límite alcanzado; muestra resultados parciales. Reduce cantidad si necesitas más."
              : ""),
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

    const fuente = [country, company.trim() || null, titles.join(", "), keyword || null, seniority || null]
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
        const savedIds = toSave.map((r) => r.apollo_id);
        removeResultsByIds(savedIds);

        const parts = [`${data.inserted} nuevo(s)`];
        if (data.updated) parts.push(`${data.updated} actualizado(s)`);
        if (data.skipped) parts.push(`${data.skipped} omitido(s)`);
        showSuccess(
          `${parts.join(", ")} con email y teléfono verificados. Se añadieron al final del portafolio.`,
          "Guardado en portafolio"
        );
        if (data.inserted > 0) {
          router.push("/portafolio?page=last");
        }
      }
    } catch {
      showError("Error de red al guardar. Intenta de nuevo.", "No se guardó en portafolio");
    } finally {
      setSaving(false);
    }
  }

  function dismissResults() {
    clearSession();
    clear();
    showInfo("Se eliminaron los resultados de la búsqueda actual.", "Búsqueda limpiada");
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
  const hasResults = results.length > 0;

  return (
    <div className="flex w-full flex-1">
      <aside className="filter-sidebar hidden w-[280px] shrink-0 border-r border-[#E2E6EA] bg-[#FAFBFC] dark:border-[#2A3544] dark:bg-[#151B23] lg:block">
        <SmartSearchPanel disabled={busy} onApply={handleSmartApply} />
        <ApolloSearchFilters {...filterProps} />
      </aside>

      <main className="min-w-0 flex-1 p-5 lg:p-7">
        <div className="page-header flex flex-wrap items-center justify-between gap-3">
          <h1 className="page-title">Prospección</h1>
          {hasResults && status !== "loading" && (
            <button type="button" onClick={dismissResults} className="btn-secondary" disabled={busy}>
              Limpiar resultados
            </button>
          )}
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

        {status === "idle" && !hasResults && !feedback && (
          <div className="mt-10 flex min-h-[240px] flex-col items-center justify-center text-center">
            <p className="text-body-strong mb-2">Listo para buscar</p>
            <p className="text-caption max-w-md">
              Usa búsqueda inteligente por texto o voz, indica una empresa opcional, o ajusta
              los filtros manualmente. Solo verás contactos con email y teléfono confirmados.
            </p>
          </div>
        )}

        {hasResults && status !== "loading" && (
          <>
            <div className="text-body mt-4 flex flex-wrap items-center gap-2">
              <span>{meta?.total_entries ?? results.length} en Apollo</span>
              <span className="text-[#C8D0D8]">·</span>
              <span>{results.length} en esta sesión</span>
              <span className="text-[#C8D0D8]">·</span>
              <span>{selected.size} seleccionados</span>
              <button type="button" onClick={selectAllResults} className="btn-link" disabled={busy}>
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
                          onChange={() => toggleSelected(r.apollo_id)}
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
