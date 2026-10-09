"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Building2, Copy, Mail, Phone, Search } from "lucide-react";
import type { SmartSearchResult } from "@/lib/smart-search";
import type { ApolloPerson } from "@/lib/types";
import { ApolloSearchFilters } from "@/components/ApolloSearchFilters";
import { MAX_EXCEL_COMPANIES, type ExcelCompanyQueue } from "@/lib/excel-companies";
import type { CompanyContactsResult } from "@/lib/apollo-company-contacts";
import { SmartSearchPanel } from "@/components/SmartSearchPanel";
import { ActionBanner, FeedbackAnchor } from "@/components/ui";
import { useProspeccionSession } from "@/contexts/prospeccion-session";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { explainEmptySearchMessage, getAllPresetTitleValues } from "@/lib/apollo-filters";
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

function isFatalCompanySearchError(message: string): boolean {
  return /cr[eé]dito|insufficient credits|rate limit|l[ií]mite de solicitudes|failed to fetch|networkerror|load failed|tiempo de espera|tard[oó] demasiado/i.test(
    message
  );
}

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
    applyFilters,
    excelQueue,
    setExcelQueue,
    appendResults,
  } = session;

  const [saving, setSaving] = useState(false);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);
  const batchRun = useRef(0);
  const excelMode = Boolean(excelQueue);
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
      setEmployeeRanges(params.employeeRanges);
      setPerPage(params.perPage);
    }

    batchRun.current += 1;
    setBatchProgress(null);
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
      const raw = e instanceof Error ? e.message : "Error de búsqueda";
      const friendly = /failed to fetch|networkerror|load failed|network request failed/i.test(
        raw
      )
        ? "La búsqueda se interrumpió (tiempo de espera o red). Prueba con 5 resultados, quita el filtro de tamaño de empresa y vuelve a ejecutar."
        : raw;
      showError(friendly, "Búsqueda fallida");
      setResults([]);
      setMeta(null);
    }
  }

  function resetResults() {
    setResults([]);
    setSelectedIds([]);
    setMeta(null);
    setStatus("idle");
  }

  function loadExcel(queue: ExcelCompanyQueue) {
    batchRun.current += 1;
    resetResults();
    setExcelQueue(queue);
    clear();
    showInfo(
      `${queue.entries.length} empresa(s) cargadas. La búsqueda se hará solo dentro de estas empresas.`,
      "Archivo listo"
    );
  }

  function clearExcel() {
    batchRun.current += 1;
    setBatchProgress(null);
    setExcelQueue(null);
    resetResults();
    clear();
  }

  async function searchCompanies() {
    const queue = excelQueue;
    if (!queue) return;
    if (!titles.length) {
      showWarning("Selecciona al menos un cargo o pulsa Todos.", "Filtros incompletos");
      return;
    }

    const batch = queue.entries.filter((entry) => entry.status === "pending").slice(0, MAX_EXCEL_COMPANIES);
    if (!batch.length) return;

    const allRoles = getAllPresetTitleValues().every((value) => titles.includes(value));
    const totalCompanies = queue.entries.length;
    const reviewedBefore = queue.entries.filter((entry) => entry.status !== "pending").length;
    const runId = ++batchRun.current;
    setStatus("loading");
    clear();

    let found = 0;
    let withContacts = 0;
    let missing = 0;
    let credits = 0;
    let failed = 0;
    let fatal: string | null = null;

    for (let index = 0; index < batch.length; index++) {
      if (batchRun.current !== runId) return;
      const entry = batch[index];
      setBatchProgress(`Empresa ${reviewedBefore + index + 1} de ${totalCompanies}: ${entry.name}`);

      try {
        const res = await fetch("/api/apollo/company-contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company: entry.name,
            country,
            titles: allRoles ? [] : titles,
            all_roles: allRoles,
            seniority,
            per_company: perPage,
            organization_id: entry.apolloId ?? undefined,
            organization_name: entry.apolloName ?? undefined,
          }),
        });
        const { data, error: parseError } = await parseApiResponse<
          CompanyContactsResult & { error?: string }
        >(res);
        if (batchRun.current !== runId) return;

        const message = parseError ?? data?.error ?? (!res.ok || !data ? `Error del servidor (${res.status})` : "");
        if (message || !data) {
          if (isFatalCompanySearchError(message)) {
            fatal = message;
            break;
          }
          failed += 1;
          continue;
        }

        credits += data.credits_consumed ?? 0;
        const people = data.results ?? [];
        found += people.length;
        if (people.length) withContacts += 1;
        else missing += 1;
        appendResults(people);
        setExcelQueue((current) => {
          if (!current || current.id !== queue.id) return current;
          return {
            ...current,
            entries: current.entries.map((item) =>
              item.name === entry.name
                ? {
                    ...item,
                    status: data.status,
                    contacts: item.contacts + people.length,
                    apolloId: data.organization?.id ?? item.apolloId,
                    apolloName: data.organization?.name ?? item.apolloName,
                  }
                : item
            ),
          };
        });
      } catch (e) {
        if (batchRun.current !== runId) return;
        const raw = e instanceof Error ? e.message : "Error de búsqueda";
        if (isFatalCompanySearchError(raw)) {
          fatal = raw;
          break;
        }
        failed += 1;
      }
    }

    if (batchRun.current !== runId) return;
    setBatchProgress(null);
    const totalCredits = (meta?.credits_consumed ?? 0) + credits;
    setMeta(totalCredits > 0 ? { total_entries: 0, credits_consumed: totalCredits } : null);
    setStatus(results.length + found > 0 ? "success" : "empty");

    const reviewed = withContacts + missing;
    const pendingAfter = totalCompanies - reviewedBefore - reviewed;
    const parts = [
      `${reviewed} empresa(s) revisadas: ${found} contacto(s) nuevos en ${withContacts} empresa(s)`,
      missing ? `${missing} sin contactos con email y teléfono` : "",
      failed ? `${failed} no se pudieron consultar y quedan pendientes` : "",
      pendingAfter > 0 ? `faltan ${pendingAfter} empresa(s) por revisar` : "se revisaron todas las empresas del archivo",
    ].filter(Boolean);
    const summary = `${parts.join(" · ")}.`;

    if (fatal) showWarning(`${summary} La búsqueda se detuvo: ${fatal}`, "Búsqueda detenida");
    else if (failed || !found) showWarning(summary, "Tanda terminada");
    else showSuccess(summary, "Tanda terminada");
  }

  async function handleSmartApply(result: SmartSearchResult) {
    applyInterpretedFilters(result.filters);
    showInfo(result.summary, "Filtros interpretados");
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

    const allRoles = getAllPresetTitleValues().every((value) => titles.includes(value));
    const fuente = (
      excelQueue
        ? [country, `Excel: ${excelQueue.fileLabel}`, allRoles ? "Todos los cargos" : titles.join(", "), seniority || null]
        : [country, company.trim() || null, titles.join(", "), keyword || null, seniority || null]
    )
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
          `${parts.join(", ")} con email y teléfono verificados. Se añadieron al final del portafolio.` +
            (excelQueue ? " Puedes seguir con las siguientes empresas del archivo." : ""),
          "Guardado en portafolio"
        );
        if (data.inserted > 0 && !excelQueue) {
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
    excelQueue,
    onExcelLoaded: loadExcel,
    onExcelCleared: clearExcel,
    onSearchCompanies: () => void searchCompanies(),
  };

  const busy = status === "loading" || saving;
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
        {!excelMode && <SmartSearchPanel disabled={busy} onApply={handleSmartApply} />}
        <ApolloSearchFilters {...filterProps} />
      </aside>

      <main className="min-w-0 flex-1 p-5 lg:p-6">
        <div className="page-header flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="page-title">Prospección</h1>
            <p className="text-micro mt-1">Motor de búsqueda Apollo + IA</p>
          </div>
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
          {!excelMode && <SmartSearchPanel disabled={busy} onApply={handleSmartApply} />}
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
            <p className="empty-state__title">Configura tu búsqueda</p>
            <p className="empty-state__desc">
              Describe tu prospecto ideal, usa voz, ajusta filtros o carga un Excel con empresas.
              Solo verás contactos con email y teléfono confirmados.
            </p>
          </div>
        )}

        {hasResults && status !== "loading" && (
          <>
            <div className="text-body mt-4 flex flex-wrap items-center gap-2">
              {excelMode ? (
                <span className="ui-badge ui-badge--accent">{results.length} contactos de empresas del archivo</span>
              ) : (
                <>
                  <span className="ui-badge ui-badge--neutral">{meta?.total_entries ?? results.length} en Apollo</span>
                  <span className="ui-badge ui-badge--accent">{results.length} en sesión</span>
                </>
              )}
              <span className="ui-badge ui-badge--neutral">{selected.size} seleccionados</span>
              <button type="button" onClick={selectAllResults} className="btn-link" disabled={busy}>
                Seleccionar todos
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
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || selected.size === 0}
              className="btn-primary mt-6 w-full sm:w-auto"
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
