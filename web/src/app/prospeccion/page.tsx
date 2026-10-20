"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Building2, Copy, Mail, Phone, Search } from "lucide-react";
import { formatInsightForSource, type SmartSearchResult } from "@/lib/smart-search";
import type { ApolloPerson } from "@/lib/types";
import { ApolloSearchFilters } from "@/components/ApolloSearchFilters";
import { SmartSearchPanel } from "@/components/SmartSearchPanel";
import { PageHeading } from "@/components/HelpTip";
import { ActionBanner, FeedbackAnchor } from "@/components/ui";
import { activeSearchIntent, useProspeccionSession } from "@/contexts/prospeccion-session";
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
  page?: number;
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
    setEmployeeRanges,
    setResults,
    setSelectedIds,
    setStatus,
    setMeta,
    toggleSelected,
    selectAllResults,
    removeResultsByIds,
    clearSession,
    applyInterpretedFilters,
    appendResults,
    searchIntent,
    setSearchIntent,
  } = session;

  const [saving, setSaving] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);
  const batchRun = useRef(0);
  const { feedback, showSuccess, showError, showWarning, showInfo, clear } = useActionFeedback();

  function toggleTitle(value: string) {
    setTitles(titles.includes(value) ? titles.filter((t) => t !== value) : [...titles, value]);
  }

  async function search(overrides?: Partial<SearchParams> & { append?: boolean }) {
    const append = Boolean(overrides?.append);
    const params: SearchParams = {
      country: overrides?.country ?? country,
      titles: overrides?.titles ?? titles,
      keyword: overrides?.keyword ?? keyword,
      seniority: overrides?.seniority ?? seniority,
      company: overrides?.company ?? company,
      employeeRanges: overrides?.employeeRanges ?? employeeRanges,
      perPage: overrides?.perPage ?? perPage,
      page: overrides?.page ?? 1,
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
      setEmployeeRanges(params.employeeRanges);
      setPerPage(params.perPage);
    }

    batchRun.current += 1;
    setBatchProgress(null);
    if (append) setLoadingMore(true);
    else setStatus("loading");
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
          page: params.page ?? 1,
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
      const nextMeta = data.meta ?? null;
      if (append) {
        appendResults(list);
        setMeta({
          ...(meta ?? { total_entries: nextMeta?.total_entries ?? 0 }),
          ...nextMeta,
          total_entries: nextMeta?.total_entries ?? meta?.total_entries ?? 0,
          credits_consumed: (meta?.credits_consumed ?? 0) + (nextMeta?.credits_consumed ?? 0),
        });
      } else {
        setResults(list);
        setMeta(nextMeta);
        setSelectedIds([]);
      }

      if (!append && list.length === 0) {
        setStatus("empty");
        showWarning(
          explainEmptySearchMessage(data.meta, Boolean(params.seniority?.trim())),
          "Sin contactos completos"
        );
      } else {
        setStatus("success");
        const credits = nextMeta?.credits_consumed ?? 0;
        const totalApollo = nextMeta?.total_entries ?? 0;
        const more = nextMeta?.has_more
          ? " Quedan más coincidencias: usa «Cargar siguiente lote» si quieres revisar otras (gasta créditos nuevos)."
          : "";
        if (append && list.length === 0) {
          showWarning(
            `Este lote no trajo contactos completos.${more}`,
            "Sin contactos en este lote"
          );
        } else {
          const relaxed = nextMeta?.industry_relaxed
            ? " Industria ampliada con término alternativo en Apollo."
            : "";
          const org = params.company.trim() ? ` Empresa: ${params.company.trim()}.` : "";
          const skipped = nextMeta?.portfolio_skipped
            ? ` ${nextMeta.portfolio_skipped} perfil(es) ya en portafolio omitidos (sin gastar créditos).`
            : "";
          const countryFiltered =
            nextMeta?.country_rejected && nextMeta.country_rejected > 0
              ? ` ${nextMeta.country_rejected} descartados por ubicación en otro país.`
              : "";
          showSuccess(
            `${list.length} contacto(s) con email y teléfono · ${totalApollo} coincidencias en Apollo` +
              (credits > 0 ? ` · ${credits} crédito(s) usados en este lote` : "") +
              org +
              skipped +
              countryFiltered +
              relaxed +
              more +
              (nextMeta?.timed_out
                ? " Tiempo límite alcanzado; muestra resultados parciales. Reduce cantidad si necesitas más."
                : ""),
            append ? "Lote añadido" : "Búsqueda completada"
          );
        }
      }
    } catch (e) {
      if (!append) {
        setStatus("error");
        setResults([]);
        setMeta(null);
      }
      const raw = e instanceof Error ? e.message : "Error de búsqueda";
      const friendly = /failed to fetch|networkerror|load failed|network request failed/i.test(
        raw
      )
        ? "La búsqueda se interrumpió (tiempo de espera o red). Prueba con 5 resultados, quita el filtro de tamaño de empresa y vuelve a ejecutar."
        : raw;
      showError(friendly, append ? "No se cargó el siguiente lote" : "Búsqueda fallida");
    } finally {
      setLoadingMore(false);
    }
  }

  function rememberIntent(result: SmartSearchResult) {
    const text = formatInsightForSource(result.insight);
    setSearchIntent(text ? { text, titles: [...result.filters.titles] } : null);
  }

  /** «Ajustar filtros»: pasa los criterios al panel sin gastar créditos. */
  function handleSmartApply(result: SmartSearchResult) {
    applyInterpretedFilters(result.filters);
    rememberIntent(result);
    clear();
  }

  /** «Buscar en Apollo»: el vendedor ya confirmó los criterios interpretados. */
  async function handleSmartSearch(result: SmartSearchResult) {
    applyInterpretedFilters(result.filters);
    rememberIntent(result);
    showInfo(result.summary, "Criterios confirmados");
    await search({ ...result.filters });
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

    const intent = activeSearchIntent(searchIntent, titles);
    const fuente = [country, company.trim() || null, titles.join(", "), keyword || null, seniority || null, intent]
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
    employeeRanges,
    setEmployeeRanges,
    perPage,
    setPerPage,
    loading: status === "loading" || saving,
    onSearch: () => search(),
  };

  const busy = status === "loading" || saving || loadingMore;
  const hasResults = results.length > 0;

  function initials(name: string) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase();
  }

  function copyText(text: string) {
    void navigator.clipboard.writeText(text);
  }

  return (
    <div className="flex w-full flex-1">
      <aside className="filter-sidebar hidden w-full max-w-[400px] shrink-0 border-r lg:block lg:w-[min(40%,400px)]">
        <SmartSearchPanel disabled={busy} onApply={handleSmartApply} onSearch={handleSmartSearch} />
        <ApolloSearchFilters {...filterProps} />
      </aside>

      <main className="min-w-0 flex-1 p-5 lg:p-6">
        <div className="page-header flex flex-wrap items-center justify-between gap-3">
          <PageHeading
            title="Prospección"
            help="Busca en Apollo por país, empresa y cargo, o dicta la búsqueda. Solo se muestran contactos con email y teléfono. Para completar un listado de personas usa Enriquecer. Guardar no vuelve a cobrar: Apollo cobra al revelar esos datos. Cada lote nuevo gasta créditos de tu cuenta."
          />
          {meta?.credits_consumed != null && status !== "loading" && (
            <span className="ui-badge ui-badge--accent">
              ~{meta.credits_consumed} créditos usados
            </span>
          )}
          {hasResults && status !== "loading" && (
            <button type="button" onClick={dismissResults} className="btn-secondary" disabled={busy}>
              Limpiar resultados
            </button>
          )}
        </div>

        <div className="mt-4 lg:hidden">
          <SmartSearchPanel disabled={busy} onApply={handleSmartApply} onSearch={handleSmartSearch} />
          <ApolloSearchFilters {...filterProps} />
        </div>

        {feedback && (
          <FeedbackAnchor>
            <ActionBanner {...feedback} onDismiss={clear} />
          </FeedbackAnchor>
        )}

        {status === "loading" && (
          <div className="mt-10 flex flex-col items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
            <p className="text-caption">{batchProgress ?? "Buscando en Apollo…"}</p>
            <div className="w-full max-w-md space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="kpi-skeleton h-20" />
              ))}
            </div>
          </div>
        )}

        {status === "idle" && !hasResults && !feedback && (
          <div className="empty-state mt-6">
            <Search className="empty-state__icon" size={48} strokeWidth={1.5} aria-hidden />
            <p className="empty-state__title">Sin resultados todavía</p>
            <p className="empty-state__desc">Ajusta los filtros y ejecuta la búsqueda.</p>
          </div>
        )}

        {hasResults && status !== "loading" && (
          <>
            <div className="text-body mt-4 flex flex-wrap items-center gap-2">
              <>
                  <span className="ui-badge ui-badge--neutral">
                    {meta?.total_entries ?? results.length} coincidencias en Apollo
                  </span>
                  <span className="ui-badge ui-badge--accent">{results.length} con email y teléfono</span>
                  {meta?.page && meta.total_pages ? (
                    <span className="ui-badge ui-badge--neutral">
                      lote hasta pág. {meta.page} de {meta.total_pages}
                    </span>
                  ) : null}
                </>
              <span className="ui-badge ui-badge--neutral">{selected.size} seleccionados</span>
              <button type="button" onClick={selectAllResults} className="btn-link" disabled={busy}>
                Seleccionar todos
              </button>
            </div>
            <div className="prospect-savebar">
              <span className="text-caption">
                {selected.size > 0 ? `${selected.size} listos para guardar` : "Marca los contactos que entran al portafolio"}
              </span>
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy || selected.size === 0}
                className="btn-primary"
              >
                {saving
                  ? "Guardando…"
                  : selected.size > 0
                    ? `Guardar (${selected.size})`
                    : "Guardar"}
              </button>
            </div>
            <ul className="mt-4 flex flex-col gap-3">
              {results.map((r: ApolloPerson) => (
                <li key={r.apollo_id} className="prospect-card">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-2"
                      checked={selected.has(r.apollo_id)}
                      onChange={() => toggleSelected(r.apollo_id)}
                      disabled={busy}
                      aria-label={`Seleccionar ${r.nombre}`}
                    />
                    <div className="prospect-avatar" aria-hidden>
                      {initials(r.nombre)}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-semibold text-[var(--color-text-primary)]">{r.nombre}</p>
                    <p className="text-caption">{r.cargo ?? "—"}</p>
                    <p className="text-caption mt-1 flex items-center gap-1.5">
                      <Building2 size={14} strokeWidth={1.5} aria-hidden />
                      {r.empresa ?? "—"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3 text-[13px]">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]"
                        onClick={() => copyText(r.email ?? "")}
                      >
                        <Mail size={14} strokeWidth={1.5} aria-hidden />
                        {r.email}
                        <Copy size={12} strokeWidth={1.5} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]"
                        onClick={() => copyText(r.telefono ?? "")}
                      >
                        <Phone size={14} strokeWidth={1.5} aria-hidden />
                        {r.telefono}
                        <Copy size={12} strokeWidth={1.5} aria-hidden />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {Boolean(meta?.has_more && meta.next_page) && (
              <div className="prospect-next-lote mt-5">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => void search({ page: meta?.next_page ?? undefined, append: true })}
                >
                  {loadingMore ? "Cargando siguiente lote…" : "Cargar siguiente lote"}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
