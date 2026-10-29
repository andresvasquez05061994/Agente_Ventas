"use client";

import { useMemo, useRef, useState } from "react";
import { Download, Sparkles } from "lucide-react";
import { HelpTip, PageHeading } from "@/components/HelpTip";
import { ActionBanner, FeedbackAnchor, FieldLabel, SectionLabel } from "@/components/ui";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { APOLLO_COUNTRIES, APOLLO_EMPLOYEE_RANGES, APOLLO_KEYWORDS } from "@/lib/apollo-filters";
import type { AttendeeMatchResult } from "@/lib/apollo-attendee-match";
import type { PortfolioContact } from "@/lib/excel-document";
import { findPortfolioContacts, rowAlreadyComplete } from "@/lib/portfolio-enrich";
import type {
  EnrichmentConfig,
  EnrichmentOutcome,
  EnrichmentSession,
} from "@/lib/enrichment-session";
import { restoreEnrichmentSession } from "@/lib/enrichment-session";
import {
  applyPersonToRow,
  ENRICH_PAGE_SIZE,
  ensureFillColumns,
  FILL_FIELDS,
  isPendingEnrichmentStatus,
  MAX_ENRICH_BATCH,
  parseEnrichMatrix,
  SEARCH_FIELDS,
  searchCompany,
  searchCountry,
  searchEmployeeRanges,
  searchIndustry,
  searchName,
  searchTitle,
  resolveEnrichCountry,
  resolveEnrichIndustry,
  suggestedSearchBy,
  type EnrichFieldId,
  type EnrichRowStatus,
  type EnrichSheet,
} from "@/lib/excel-enrich";
import { readWorkbookMatrix } from "@/lib/excel-companies";
import { parseApiResponse } from "@/lib/parse-api-response";
import type { ApolloPerson } from "@/lib/types";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const OUTPUT_FILL_FIELDS: EnrichFieldId[] = ["email", "empresa", "pais", "telefono", "nombre", "cargo"];

type CompanyRoleSearchResponse = {
  results?: ApolloPerson[];
  meta?: { credits_consumed?: number };
  error?: string;
};

type CompanyContactsResponse = {
  results?: ApolloPerson[];
  credits_consumed?: number;
  error?: string;
};

type EnrichmentSessionResponse = {
  session: EnrichmentSession;
  resumed: boolean;
};

type PortfolioResponse = {
  contacts?: PortfolioContact[];
  error?: string;
};

function isFatal(message: string): boolean {
  return /cr[eé]dito|presupuesto|insufficient credits|rate limit|l[ií]mite de solicitudes|carga masiva alcanz|failed to fetch|networkerror|load failed/i.test(
    message
  );
}

async function workbookBase64(headers: string[], rows: string[][]): Promise<{ filename: string; fileBase64: string }> {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = headers.map((header) => ({ wch: Math.min(48, Math.max(header.length + 2, 16)) }));
  XLSX.utils.book_append_sheet(book, sheet, "Enriquecido");
  const buffer = XLSX.write(book, { type: "base64", bookType: "xlsx" }) as string;
  return { filename: "enriquecido.xlsx", fileBase64: buffer };
}

function countryLabelOf(value: string): string {
  return APOLLO_COUNTRIES.find((item) => item.value === value)?.label ?? value;
}

function countriesCaption(allCountries: boolean, countries: string[]): string {
  if (allCountries || !countries.length) return "todos los países";
  return countries.map(countryLabelOf).join(", ");
}

function downloadBase64(filename: string, fileBase64: string) {
  const binary = atob(fileBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function fileFingerprint(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function paddedRow(row: string[], width: number): string[] {
  return Array.from({ length: width }, (_, index) => row[index] ?? "");
}

export default function EnriquecerPage() {
  const { feedback, showError, showSuccess, showWarning, showInfo, clear } = useActionFeedback(0);
  const runId = useRef(0);
  const [sheet, setSheet] = useState<EnrichSheet | null>(null);
  const [statuses, setStatuses] = useState<EnrichRowStatus[]>([]);
  const [searchBy, setSearchBy] = useState<EnrichFieldId[]>([]);
  const [allCountries, setAllCountries] = useState(true);
  const [countries, setCountries] = useState<string[]>(["Colombia"]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [credits, setCredits] = useState(0);
  const [saved, setSaved] = useState(0);
  const [page, setPage] = useState(1);
  const [fallbackTitles, setFallbackTitles] = useState("");
  const [fallbackIndustry, setFallbackIndustry] = useState("");
  const [fallbackEmployeeRange, setFallbackEmployeeRange] = useState("");
  const [contactsPerRow, setContactsPerRow] = useState(3);
  const [sourceRows, setSourceRows] = useState(0);
  const [nextBatchApproval, setNextBatchApproval] = useState(false);
  const [jobId, setJobId] = useState<number | null>(null);
  const [portfolioContacts, setPortfolioContacts] = useState<PortfolioContact[]>([]);
  const [portfolioReady, setPortfolioReady] = useState(false);

  const mappedFields = useMemo(
    () => new Set((sheet?.columns ?? []).map((column) => column.field).filter(Boolean) as EnrichFieldId[]),
    [sheet]
  );
  const sourceStatuses = statuses.slice(0, sourceRows);
  const pending = sourceStatuses.filter(isPendingEnrichmentStatus).length;
  const filled = sourceStatuses.filter(
    (status) => status === "filled" || status === "already" || status === "portfolio"
  ).length;
  const portfolioFilled = sourceStatuses.filter((status) => status === "portfolio").length;
  const analyzedRows = sourceStatuses.filter((status) => status !== "pending").length;
  const totalPages = Math.max(1, Math.ceil((sheet?.rows.length ?? 0) / ENRICH_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * ENRICH_PAGE_SIZE;
  const pageRows = sheet?.rows.slice(pageStart, pageStart + ENRICH_PAGE_SIZE) ?? [];
  const displayedProgress = Math.min(sourceRows, analyzedRows);
  const progressPercent = sourceRows
    ? Math.round((displayedProgress / sourceRows) * 100)
    : 0;

  function currentConfig(): EnrichmentConfig {
    return {
      searchBy,
      allCountries,
      countries,
      fallbackTitles,
      fallbackIndustry,
      fallbackEmployeeRange,
      contactsPerRow,
    };
  }

  async function loadPortfolio(): Promise<PortfolioContact[]> {
    const res = await fetch("/api/enrich/portfolio", { cache: "no-store" });
    const { data, error } = await parseApiResponse<PortfolioResponse>(res);
    const message = error ?? data?.error;
    if (!res.ok || message || !data) throw new Error(message ?? "No se pudo consultar el portafolio.");
    const contacts = Array.isArray(data.contacts) ? data.contacts : [];
    setPortfolioContacts(contacts);
    setPortfolioReady(true);
    return contacts;
  }

  async function onFile(file: File | undefined) {
    clear();
    setSheet(null);
    setStatuses([]);
    setCredits(0);
    setSaved(0);
    setSourceRows(0);
    setPage(1);
    setNextBatchApproval(false);
    setJobId(null);
    setPortfolioContacts([]);
    setPortfolioReady(false);
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      showError("Usa un Excel (.xlsx, .xls) o CSV.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showError("El archivo supera 2 MB.");
      return;
    }
    try {
      setBusy(true);
      setProgress("Leyendo el archivo y revisando el avance guardado…");
      const bytes = await file.arrayBuffer();
      const matrix = await readWorkbookMatrix(bytes, file.name);
      const parsed = parseEnrichMatrix(matrix);
      const next: EnrichSheet = { ...parsed, fileLabel: file.name };
      const fingerprint = await fileFingerprint(bytes);
      const sessionRequest = await fetch("/api/enrich/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fingerprint,
          filename: file.name,
          headers: next.headers,
          columns: next.columns,
          sourceRows: next.rows.length,
        }),
      });
      const { data, error } = await parseApiResponse<EnrichmentSessionResponse>(sessionRequest);
      const message = error ?? (data as { error?: string } | null)?.error;
      if (!sessionRequest.ok || message || !data?.session) {
        throw new Error(message ?? "No se pudo recuperar el avance del archivo.");
      }

      const restored = restoreEnrichmentSession(next, data.session);
      const config = data.session.config;
      const search = config.searchBy?.length ? config.searchBy : suggestedSearchBy(restored.sheet.columns);
      setSheet(restored.sheet);
      setSourceRows(next.rows.length);
      setStatuses(restored.statuses);
      setJobId(data.session.id);
      setCredits(data.session.outcomes.reduce((total, outcome) => total + outcome.credits, 0));
      setSearchBy(search);
      if (typeof config.allCountries === "boolean") setAllCountries(config.allCountries);
      if (config.countries?.length) setCountries(config.countries);
      if (typeof config.fallbackTitles === "string") setFallbackTitles(config.fallbackTitles);
      if (typeof config.fallbackIndustry === "string") setFallbackIndustry(config.fallbackIndustry);
      if (typeof config.fallbackEmployeeRange === "string") setFallbackEmployeeRange(config.fallbackEmployeeRange);
      if (typeof config.contactsPerRow === "number") setContactsPerRow(config.contactsPerRow);
      await loadPortfolio();

      const restoredAnalyzed = restored.statuses.slice(0, next.rows.length).filter((status) => status !== "pending").length;
      const nextPending = restored.statuses.slice(0, next.rows.length).findIndex((status) => status === "pending");
      const canSearchByCompanyRole = search.includes("empresa") && search.includes("cargo") && search.includes("pais");
      if (data.resumed && restoredAnalyzed > 0) {
        showInfo(
          `${restoredAnalyzed} de ${next.rows.length} filas ya estaban analizadas (${Math.round((restoredAnalyzed / next.rows.length) * 100)}%). ${nextPending >= 0 ? `La siguiente tanda comienza en la fila ${nextPending + 1}.` : "El archivo ya no tiene filas pendientes."}`,
          "Archivo reanudado"
        );
      } else if (!search.includes("nombre") && !canSearchByCompanyRole) {
        showWarning(
          "El portafolio se revisará primero. Para consultar Apollo, usa Nombre, Empresa, o Cargo con un país seleccionado. Las filas sin datos suficientes se marcarán sin consumir créditos.",
          "Faltan datos de búsqueda"
        );
      } else {
        showInfo(
          `${next.rows.length} filas leídas. El portafolio se validará antes de Apollo; luego puedes analizar la primera tanda.`,
          "Archivo listo"
        );
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function setColumnField(index: number, field: EnrichFieldId | "") {
    setSheet((current) => {
      if (!current) return current;
      const columns = current.columns.map((column) =>
        column.index === index ? { ...column, field: field || null } : column.field === field ? { ...column, field: null } : column
      );
      return { ...current, columns };
    });
    if (field === "nombre") {
      setSearchBy((current) => (current.includes("nombre") ? current : ["nombre", ...current]));
    }
  }

  function toggleSearch(id: EnrichFieldId) {
    if (id === "nombre") return;
    setSearchBy((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleAllCountries() {
    if (allCountries) {
      setAllCountries(false);
      setCountries((current) => (current.length ? current : ["Colombia"]));
      return;
    }
    setAllCountries(true);
  }

  function toggleCountry(value: string) {
    if (allCountries) {
      setAllCountries(false);
      setCountries([value]);
      return;
    }
    if (countries.includes(value)) {
      const next = countries.filter((item) => item !== value);
      if (!next.length) {
        setAllCountries(true);
        return;
      }
      setCountries(next);
      return;
    }
    setCountries([...countries, value]);
  }

  function countriesForRow(
    row: string[],
    columns: EnrichSheet["columns"]
  ): { all_countries: boolean; countries: string[]; invalidCountry?: string } {
    if (searchBy.includes("pais")) {
      const rawCountry = searchCountry(row, columns);
      if (rawCountry) {
        const country = resolveEnrichCountry(rawCountry);
        if (!country) return { all_countries: false, countries: [], invalidCountry: rawCountry };
        return { all_countries: false, countries: [country] };
      }
    }
    if (allCountries) return { all_countries: true, countries: [] };
    return { all_countries: false, countries };
  }

  function configuredTitles(): string[] {
    return fallbackTitles
      .split(/[,;\n]/)
      .map((title) => title.trim())
      .filter(Boolean)
      .slice(0, 10);
  }

  async function persistOutcome(
    activeJobId: number,
    prepared: EnrichSheet,
    outcome: EnrichmentOutcome
  ) {
    const res = await fetch("/api/enrich/session/rows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: activeJobId,
        headers: prepared.headers,
        columns: prepared.columns,
        config: currentConfig(),
        outcome,
      }),
    });
    const { data, error } = await parseApiResponse<{ ok?: boolean; error?: string }>(res);
    const message = error ?? data?.error;
    if (!res.ok || message || !data?.ok) throw new Error(message ?? "No se pudo guardar el avance.");
  }

  async function enrichBatch() {
    if (!sheet || !jobId) return;
    let contacts = portfolioContacts;
    if (!portfolioReady) {
      try {
        setProgress("Consultando el portafolio antes de Apollo…");
        contacts = await loadPortfolio();
      } catch (error) {
        showError(error instanceof Error ? error.message : "No se pudo consultar el portafolio.", "Portafolio no disponible");
        setProgress(null);
        return;
      }
    }

    const prepared = ensureFillColumns(sheet, OUTPUT_FILL_FIELDS);
    const pendingIndexes = Array.from({ length: sourceRows }, (_, index) => index)
      .filter((index) => isPendingEnrichmentStatus(statuses[index]))
      .slice(0, MAX_ENRICH_BATCH);
    if (!pendingIndexes.length) {
      showInfo("No quedan filas por analizar.", "Listo");
      return;
    }

    const thisRun = ++runId.current;
    setBusy(true);
    setNextBatchApproval(false);
    clear();
    setSheet(prepared);
    const nextRows = prepared.rows.map((row) => [...row]);
    const nextStatuses = [...statuses];
    let batchCredits = 0;
    const foundPeople: ApolloPerson[] = [];
    let portfolioMatches = 0;
    let missing = 0;
    let failed = 0;
    let fatal: string | null = null;

    const applyAndPersist = async (outcome: EnrichmentOutcome) => {
      await persistOutcome(jobId, prepared, outcome);
      nextStatuses[outcome.sourceIndex] = outcome.status;
      const [first, ...extras] = outcome.rows;
      if (first) nextRows[outcome.sourceIndex] = paddedRow(first, prepared.headers.length);
      for (const extra of extras) {
        nextRows.push(paddedRow(extra, prepared.headers.length));
        nextStatuses.push(outcome.status);
      }
      setStatuses([...nextStatuses]);
      setSheet({ ...prepared, rows: nextRows.map((row) => [...row]) });
    };

    for (let i = 0; i < pendingIndexes.length; i++) {
      if (runId.current !== thisRun) return;
      const rowIndex = pendingIndexes[i];
      const row = nextRows[rowIndex];
      const name = searchBy.includes("nombre") ? searchName(row, prepared.columns) : "";
      const company = searchBy.includes("empresa") ? searchCompany(row, prepared.columns) : "";
      const title = searchBy.includes("cargo") ? searchTitle(row, prepared.columns) : "";
      const rowCountries = countriesForRow(row, prepared.columns);
      const rowTitle = name || company || title || "Sin datos de búsqueda";

      try {
        setProgress(`Fila ${rowIndex + 1} de ${sourceRows}: revisando portafolio para ${rowTitle}`);
        if (rowAlreadyComplete(row, prepared.columns)) {
          await applyAndPersist({
            sourceIndex: rowIndex,
            status: "filled",
            source: "validation",
            rows: [row],
            credits: 0,
          });
          continue;
        }

        const portfolio = findPortfolioContacts(row, prepared.columns, contacts, contactsPerRow);
        if (portfolio.people.length) {
          const resultRows = portfolio.people.map((person) =>
            applyPersonToRow([...row], prepared.columns, OUTPUT_FILL_FIELDS, person)
          );
          await applyAndPersist({
            sourceIndex: rowIndex,
            status: "portfolio",
            source: "portfolio",
            rows: resultRows,
            credits: 0,
          });
          portfolioMatches += portfolio.people.length;
          continue;
        }

        if (rowCountries.invalidCountry) {
          await applyAndPersist({
            sourceIndex: rowIndex,
            status: "invalid_country",
            source: "validation",
            rows: [row],
            credits: 0,
          });
          failed += 1;
          continue;
        }

        const broadTitles = title ? [title] : configuredTitles();
        const broadByCompany = !name && Boolean(company);
        const broadByTitle = !name && !company && Boolean(broadTitles.length && rowCountries.countries.length === 1);
        if (!name && !broadByCompany && !broadByTitle) {
          await applyAndPersist({
            sourceIndex: rowIndex,
            status: "insufficient_data",
            source: "validation",
            rows: [row],
            credits: 0,
          });
          failed += 1;
          continue;
        }

        setProgress(`Fila ${rowIndex + 1} de ${sourceRows}: consultando Apollo para ${rowTitle}`);
        const request = broadByCompany
          ? {
              url: "/api/apollo/enrich-company-contacts",
              body: {
                company,
                country: rowCountries.countries[0] ?? "",
                titles: broadTitles,
                all_roles: !broadTitles.length,
                per_company: Math.max(5, contactsPerRow),
                requested_count: contactsPerRow,
              },
            }
          : broadByTitle
            ? {
                url: "/api/apollo/enrich-search",
                body: {
                  country: rowCountries.countries[0],
                  titles: broadTitles,
                  company: company || undefined,
                  keyword: (searchBy.includes("industria")
                    ? resolveEnrichIndustry(searchIndustry(row, prepared.columns))
                    : "") || fallbackIndustry,
                  employeeRanges: (searchBy.includes("tamano_empresa")
                    ? searchEmployeeRanges(row, prepared.columns)
                    : []).length
                    ? searchEmployeeRanges(row, prepared.columns)
                    : fallbackEmployeeRange ? [fallbackEmployeeRange] : [],
                  per_page: Math.max(5, contactsPerRow),
                  requested_count: contactsPerRow,
                },
              }
            : {
                url: "/api/apollo/attendee-match",
                body: {
                  name,
                  title: title || undefined,
                  company: company || undefined,
                  all_countries: rowCountries.all_countries,
                  countries: rowCountries.countries,
                },
              };
        const res = await fetch(request.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request.body),
        });
        const { data, error } = await parseApiResponse<
          (AttendeeMatchResult & { error?: string }) | CompanyRoleSearchResponse | CompanyContactsResponse
        >(res);
        if (runId.current !== thisRun) return;
        const message = error ?? (data && "error" in data ? data.error : undefined) ?? (!res.ok || !data ? `Error del servidor (${res.status})` : "");
        if (message || !data) {
          if (isFatal(message)) {
            fatal = message;
            break;
          }
          await applyAndPersist({
            sourceIndex: rowIndex,
            status: "error",
            source: "error",
            rows: [row],
            credits: 0,
          });
          failed += 1;
          continue;
        }

        const attendeeResult = data as AttendeeMatchResult & { error?: string };
        const searchResult = data as CompanyRoleSearchResponse;
        const companyResult = data as CompanyContactsResponse;
        const rawPeople = broadByCompany
          ? companyResult.results ?? []
          : broadByTitle
            ? searchResult.results ?? []
            : attendeeResult.person ? [attendeeResult.person] : [];
        const people = rawPeople.filter((person) => person.email?.trim() && person.telefono?.trim()).slice(0, contactsPerRow);
        const consumed = broadByCompany
          ? companyResult.credits_consumed ?? 0
          : broadByTitle
            ? searchResult.meta?.credits_consumed ?? 0
            : attendeeResult.credits_consumed ?? 0;
        batchCredits += consumed;
        if (people.length) {
          const resultRows = people.map((person) =>
            applyPersonToRow([...row], prepared.columns, OUTPUT_FILL_FIELDS, person)
          );
          const status: EnrichRowStatus = !broadByCompany && !broadByTitle && attendeeResult.already_saved ? "already" : "filled";
          await applyAndPersist({ sourceIndex: rowIndex, status, source: "apollo", rows: resultRows, credits: consumed });
          foundPeople.push(...people);
        } else {
          const status: EnrichRowStatus =
            !broadByCompany && !broadByTitle && attendeeResult.status === "not_found" ? "not_found" : "no_contacts";
          await applyAndPersist({ sourceIndex: rowIndex, status, source: "apollo", rows: [row], credits: consumed });
          missing += 1;
        }
      } catch (error) {
        if (runId.current !== thisRun) return;
        const message = error instanceof Error ? error.message : "Error de red";
        fatal = `No se pudo guardar el avance de la fila ${rowIndex + 1}: ${message}`;
        break;
      }
    }

    let inserted = 0;
    let saveError = "";
    if (foundPeople.length) {
      const unique = new Map(foundPeople.map((person) => [person.apollo_id, person]));
      const toSave = [...unique.values()].filter((person) => person.email?.trim() && person.telefono?.trim());
      if (toSave.length) {
        try {
          const res = await fetch("/api/leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              leads: toSave,
              fuente: `Enriquecer: ${prepared.fileLabel} | ${countriesCaption(allCountries, countries)}`,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.error) {
            saveError = String(data.error ?? `No se guardó en el portafolio (${res.status}). El Excel sí se puede descargar.`);
          } else {
            inserted = Number(data.inserted ?? 0) + Number(data.updated ?? 0);
          }
        } catch (error) {
          saveError = error instanceof Error ? error.message : "No se guardó en el portafolio. El Excel sí se puede descargar.";
        }
      }
    }

    if (runId.current !== thisRun) return;
    setBusy(false);
    setProgress(null);
    setCredits((current) => current + batchCredits);
    setSaved((current) => current + inserted);
    const left = nextStatuses.slice(0, sourceRows).filter(isPendingEnrichmentStatus).length;
    const invalidCountries = nextStatuses.slice(0, sourceRows).filter((status) => status === "invalid_country").length;
    const summary = `${portfolioMatches} desde portafolio · ${foundPeople.length} desde Apollo con móvil y correo · ${missing} sin coincidencia completa${invalidCountries ? ` · ${invalidCountries} con país no admitido` : ""}${failed ? ` · ${failed} con error` : ""} · ${inserted} al portafolio${left ? ` · faltan ${left}` : ""}${saveError ? `. ${saveError}` : "."}`;
    if (fatal) showWarning(`${summary} Se detuvo: ${fatal}`, "Tanda detenida");
    else if (saveError || (!foundPeople.length && !portfolioMatches)) showWarning(summary, "Tanda terminada");
    else showSuccess(summary, "Tanda terminada");
    if (!fatal && left > 0) setNextBatchApproval(true);
  }

  async function download() {
    if (!sheet) return;
    const { fileBase64 } = await workbookBase64(sheet.headers, sheet.rows);
    const base = sheet.fileLabel.replace(/\.(xlsx|xls|csv)$/i, "");
    downloadBase64(`${base}_enriquecido.xlsx`, fileBase64);
  }

  return (
    <main className="app-content flex-1 py-6 lg:py-8">
      <header className="page-header">
        <PageHeading
          title="Enriquecer archivo"
          help="Carga un Excel o CSV. Antes de consultar Apollo, cada fila se contrasta con tu portafolio para reutilizar correo, empresa, país y móvil sin créditos. El avance queda guardado por archivo: si recargas, vuelve a elegir el mismo archivo y se reanuda desde la primera fila pendiente."
        />
      </header>

      {feedback && (
        <FeedbackAnchor className="mt-6">
          <ActionBanner tone={feedback.tone} title={feedback.title} message={feedback.message} onDismiss={clear} />
        </FeedbackAnchor>
      )}

      <section className="settings-panel enrich-section mt-6">
        <div className="enrich-section__heading"><div><p className="section-label">1. Archivo</p><h2>Datos actuales</h2></div><HelpTip label="Ayuda sobre el archivo">Carga la primera hoja de un archivo Excel o CSV. El módulo calcula una huella del contenido para conservar el avance. Tras actualizar la página debes volver a elegir el mismo archivo: se leerá otra vez, se mostrará el avance recuperado y solo seguirán las filas pendientes.</HelpTip></div>
        <div className="document-upload">
          <input
            id="enrich-file"
            className="document-upload__input"
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
          <label htmlFor="enrich-file" className="btn-secondary">
            {sheet ? sheet.fileLabel : "Elegir Excel o CSV"}
          </label>
        </div>
      </section>

      {sheet && (
        <>
          <section className="settings-panel enrich-section mt-4">
            <div className="enrich-section__heading"><div><p className="section-label">Datos detectados</p><h2>Confirma las columnas</h2></div><HelpTip label="Ayuda sobre las columnas">El sistema asigna automáticamente las columnas conocidas. Ajusta únicamente las que estén mal clasificadas o marca Ignorar para que nunca se usen en la búsqueda.</HelpTip></div>
            <div className="enrich-columns grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2.5">
              {sheet.columns.map((column) => (
                <label key={column.index} className="enrich-column flex min-w-0 flex-col gap-1">
                  <span className="enrich-column__header truncate text-xs text-[var(--color-text-secondary)]" title={column.header}>
                    {column.header}
                  </span>
                  <select
                    className="input-field"
                    value={column.field ?? ""}
                    onChange={(event) => setColumnField(column.index, event.target.value as EnrichFieldId | "")}
                    disabled={busy}
                  >
                    <option value="">Ignorar</option>
                    {SEARCH_FIELDS.concat(FILL_FIELDS.filter((field) => !SEARCH_FIELDS.some((item) => item.id === field.id))).map(
                      (field) => (
                        <option key={field.id} value={field.id}>
                          {field.label}
                        </option>
                      )
                    )}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section className="settings-panel enrich-section mt-4">
            <div className="enrich-section__heading"><div><p className="section-label">2. Búsqueda</p><h2>Define cómo encontrar contactos</h2></div><HelpTip label="Ayuda sobre la búsqueda">Cada tanda revisa primero el portafolio. Para Apollo: Nombre puede buscarse sin país; Empresa puede traer contactos de esa empresa; Cargo requiere un país único para evitar resultados demasiado amplios. Si no hay datos suficientes, la fila se marca sin consumir créditos.</HelpTip></div>
            <FieldLabel>País de búsqueda</FieldLabel>
            <div className="enrich-checks mb-4 flex flex-wrap gap-x-4 gap-y-2">
              <label className="enrich-check inline-flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={allCountries} disabled={busy} onChange={toggleAllCountries} />
                Todos los países
              </label>
              {APOLLO_COUNTRIES.map((item) => (
                <label key={item.value} className="enrich-check inline-flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={!allCountries && countries.includes(item.value)}
                    disabled={busy}
                    onChange={() => toggleCountry(item.value)}
                  />
                  {item.label}
                </label>
              ))}
            </div>

            <SectionLabel>Campos del archivo que se usarán</SectionLabel>
            <div className="enrich-checks mb-4 flex flex-wrap gap-x-4 gap-y-2">
              {SEARCH_FIELDS.map((field) => (
                <label key={field.id} className="enrich-check inline-flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={searchBy.includes(field.id)}
                    disabled={busy || field.id === "nombre" || !mappedFields.has(field.id)}
                    onChange={() => toggleSearch(field.id)}
                  />
                  {field.label}
                </label>
              ))}
            </div>

            <SectionLabel>Filtros de respaldo</SectionLabel>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="field-group">
                <span className="field-label">Cargos si el archivo no los trae</span>
                <input className="input-field" value={fallbackTitles} disabled={busy} onChange={(event) => setFallbackTitles(event.target.value)} placeholder="Ej.: CEO, Director de TI" />
              </label>
              <label className="field-group">
                <span className="field-label">Industria opcional</span>
                <select className="input-field" value={fallbackIndustry} disabled={busy} onChange={(event) => setFallbackIndustry(event.target.value)}>
                  {APOLLO_KEYWORDS.map((industry) => <option key={industry.value} value={industry.value}>{industry.label}</option>)}
                </select>
              </label>
              <label className="field-group">
                <span className="field-label">Tamaño opcional</span>
                <select className="input-field" value={fallbackEmployeeRange} disabled={busy} onChange={(event) => setFallbackEmployeeRange(event.target.value)}>
                  {APOLLO_EMPLOYEE_RANGES.map((range) => <option key={range.value} value={range.value}>{range.label}</option>)}
                </select>
              </label>
              <label className="field-group">
                <span className="field-label">Máximo de contactos por fila</span>
                <select className="input-field" value={contactsPerRow} disabled={busy} onChange={(event) => setContactsPerRow(Number(event.target.value))}>
                  {[1, 2, 3, 5, 10].map((amount) => <option key={amount} value={amount}>{amount}</option>)}
                </select>
              </label>
            </div>

            <div className="enrich-output-summary"><div><p className="section-label">3. Archivo de salida</p><h2>Contactos enriquecidos</h2><p>Se priorizan Correo, Empresa, País y Móvil. Los valores existentes no se reemplazan.</p></div><HelpTip label="Ayuda sobre el archivo de salida">Los contactos completos del portafolio se usan antes que Apollo. Cuando una empresa o cargo devuelve varias personas, el archivo agrega una fila por contacto. Solo se agregan contactos con correo y móvil completos.</HelpTip></div>

            <div className="enrich-progress" aria-live="polite">
              <div className="enrich-progress__head"><span>{busy ? "Analizando filas" : "Filas analizadas"}</span><strong>{displayedProgress} de {sourceRows} · {progressPercent}%</strong></div>
              <div className="enrich-progress__track"><span style={{ width: `${progressPercent}%` }} /></div>
            </div>
            {nextBatchApproval && !busy ? (
              <div className="enrich-next-batch"><div><strong>Quedan {pending} filas por analizar.</strong><p>El siguiente bloque revisará primero tu portafolio y solo consultará Apollo para las filas que sigan pendientes.</p></div><div className="flex gap-2"><button type="button" className="btn-secondary" onClick={() => void download()}>Descargar avance</button><button type="button" className="btn-primary" onClick={() => void enrichBatch()}>Aprobar siguiente bloque</button></div></div>
            ) : (
            <div className="document-upload mt-4">
              <button type="button" className="btn-primary inline-flex items-center gap-2" disabled={busy || pending === 0} onClick={() => void enrichBatch()}>
                <Sparkles size={16} strokeWidth={1.5} aria-hidden />
                {busy ? progress ?? "Enriqueciendo…" : `Revisar hasta ${Math.min(MAX_ENRICH_BATCH, pending)} filas`}
              </button>
              <button type="button" className="btn-secondary inline-flex items-center gap-2" disabled={busy} onClick={() => void download()}>
                <Download size={16} strokeWidth={1.5} aria-hidden />
                Descargar archivo
              </button>
            </div>
            )}
            <p className="text-micro mt-2">{portfolioFilled} desde portafolio · {filled - portfolioFilled} desde Apollo o archivo · {pending} por analizar{credits ? ` · ~${credits} créditos` : ""}{saved ? ` · ${saved} en portafolio` : ""}</p>
          </section>

          <section className="mt-4">
            <EnrichPagination
              page={safePage}
              totalPages={totalPages}
              total={sheet.rows.length}
              onPageChange={setPage}
            />
            <div className="portfolio-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Estado</th>
                    {sheet.headers.map((header) => (
                      <th key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, index) => {
                    const rowIndex = pageStart + index;
                    return (
                      <tr key={`${row[0]}-${rowIndex}`}>
                        <td>{statusLabel(statuses[rowIndex] ?? "pending")}</td>
                        {row.map((cell, cellIndex) => (
                          <td key={`${rowIndex}-${cellIndex}`}>{cell || "—"}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <EnrichPagination
              page={safePage}
              totalPages={totalPages}
              total={sheet.rows.length}
              onPageChange={setPage}
            />
          </section>
        </>
      )}
    </main>
  );
}

function statusLabel(status: EnrichRowStatus): string {
  if (status === "filled") return "Completado";
  if (status === "already") return "Ya en portafolio";
  if (status === "portfolio") return "Desde portafolio";
  if (status === "no_contacts") return "Sin móvil y correo";
  if (status === "not_found") return "No coincide";
  if (status === "invalid_country") return "País no admitido";
  if (status === "insufficient_data") return "Faltan datos: usa Nombre, o Empresa + Cargo + País";
  if (status === "error") return "Error guardado, no se repetirá automáticamente";
  return "Pendiente";
}

function getPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result: (number | "…")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("…");
    result.push(sorted[i]);
  }
  return result;
}

function EnrichPagination({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * ENRICH_PAGE_SIZE + 1;
  const to = Math.min(page * ENRICH_PAGE_SIZE, total);
  return (
    <div className="portfolio-pagination">
      <p className="text-caption">
        Mostrando {from}–{to} de {total.toLocaleString("es-CO")} filas
      </p>
      <nav className="portfolio-pagination__nav" aria-label="Paginación del archivo">
        <button type="button" className="portfolio-pagination__btn" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Anterior
        </button>
        {getPageNumbers(page, totalPages).map((item, index) =>
          item === "…" ? (
            <span key={`ellipsis-${index}`} className="portfolio-pagination__ellipsis">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={`portfolio-pagination__btn ${item === page ? "portfolio-pagination__btn--active" : ""}`}
              onClick={() => onPageChange(item)}
              aria-current={item === page ? "page" : undefined}
            >
              {item}
            </button>
          )
        )}
        <button
          type="button"
          className="portfolio-pagination__btn"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Siguiente
        </button>
      </nav>
    </div>
  );
}
