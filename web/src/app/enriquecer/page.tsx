"use client";

import { useMemo, useRef, useState } from "react";
import { Download, Sparkles } from "lucide-react";
import { PageHeading } from "@/components/HelpTip";
import { ActionBanner, FeedbackAnchor, FieldLabel, SectionLabel } from "@/components/ui";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { APOLLO_COUNTRIES } from "@/lib/apollo-filters";
import type { AttendeeMatchResult } from "@/lib/apollo-attendee-match";
import {
  applyPersonToRow,
  ENRICH_PAGE_SIZE,
  ensureFillColumns,
  FILL_FIELDS,
  MAX_ENRICH_BATCH,
  parseEnrichMatrix,
  SEARCH_FIELDS,
  searchCompany,
  searchCountry,
  searchName,
  searchTitle,
  resolveEnrichCountry,
  suggestedFill,
  suggestedSearchBy,
  type EnrichFieldId,
  type EnrichRowStatus,
  type EnrichSheet,
} from "@/lib/excel-enrich";
import { readWorkbookMatrix } from "@/lib/excel-companies";
import { parseApiResponse } from "@/lib/parse-api-response";
import type { ApolloPerson } from "@/lib/types";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

function isFatal(message: string): boolean {
  return /cr[eé]dito|presupuesto|insufficient credits|rate limit|l[ií]mite de solicitudes|failed to fetch|networkerror|load failed/i.test(
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

export default function EnriquecerPage() {
  const { feedback, showError, showSuccess, showWarning, showInfo, clear } = useActionFeedback(0);
  const runId = useRef(0);
  const [sheet, setSheet] = useState<EnrichSheet | null>(null);
  const [statuses, setStatuses] = useState<EnrichRowStatus[]>([]);
  const [searchBy, setSearchBy] = useState<EnrichFieldId[]>([]);
  const [fill, setFill] = useState<EnrichFieldId[]>(suggestedFill());
  const [allCountries, setAllCountries] = useState(true);
  const [countries, setCountries] = useState<string[]>(["Colombia"]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [credits, setCredits] = useState(0);
  const [saved, setSaved] = useState(0);
  const [page, setPage] = useState(1);

  const mappedFields = useMemo(
    () => new Set((sheet?.columns ?? []).map((column) => column.field).filter(Boolean) as EnrichFieldId[]),
    [sheet]
  );
  const pending = statuses.filter((status) => status === "pending" || status === "not_found").length;
  const filled = statuses.filter((status) => status === "filled" || status === "already").length;
  const totalPages = Math.max(1, Math.ceil((sheet?.rows.length ?? 0) / ENRICH_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * ENRICH_PAGE_SIZE;
  const pageRows = sheet?.rows.slice(pageStart, pageStart + ENRICH_PAGE_SIZE) ?? [];

  async function onFile(file: File | undefined) {
    clear();
    setSheet(null);
    setStatuses([]);
    setCredits(0);
    setSaved(0);
    setPage(1);
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
      const matrix = await readWorkbookMatrix(await file.arrayBuffer(), file.name);
      const parsed = parseEnrichMatrix(matrix);
      const next: EnrichSheet = { ...parsed, fileLabel: file.name };
      setSheet(next);
      setStatuses(next.rows.map(() => "pending"));
      const search = suggestedSearchBy(next.columns);
      setSearchBy(search.includes("nombre") ? search : ["nombre", ...search]);
      setFill(suggestedFill());
      if (!search.includes("nombre")) {
        showWarning(
          "Asigna la columna Nombre. Sin ella el sistema buscaría gente de la empresa que no está en tu lista.",
          "Falta el nombre"
        );
      } else {
        showInfo(
          `${next.rows.length} fila(s) leídas. Elige por qué buscar y qué completar, luego Enriquecer.`,
          "Archivo listo"
        );
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
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

  function toggleFill(id: EnrichFieldId) {
    const meta = FILL_FIELDS.find((field) => field.id === id);
    if (meta?.required) return;
    setFill((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
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

  async function enrichBatch() {
    if (!sheet) return;
    if (!searchBy.includes("nombre")) {
      showWarning("Marca Nombre en «Buscar por». Así solo se enriquece a las personas del archivo.", "Falta el nombre");
      return;
    }
    const fillFields = [...new Set([...suggestedFill(), ...fill])];
    const prepared = ensureFillColumns(sheet, fillFields);
    const pendingIndexes = prepared.rows
      .map((_, index) => index)
      .filter((index) => statuses[index] === "pending" || statuses[index] === "not_found")
      .slice(0, MAX_ENRICH_BATCH);
    if (!pendingIndexes.length) {
      showInfo("No quedan filas por enriquecer.", "Listo");
      return;
    }

    const thisRun = ++runId.current;
    setBusy(true);
    clear();
    setSheet(prepared);
    const nextRows = prepared.rows.map((row) => [...row]);
    const nextStatuses = [...statuses];
    let batchCredits = 0;
    const foundPeople: ApolloPerson[] = [];
    let missing = 0;
    let failed = 0;
    let fatal: string | null = null;

    for (let i = 0; i < pendingIndexes.length; i++) {
      if (runId.current !== thisRun) return;
      const rowIndex = pendingIndexes[i];
      const name = searchName(nextRows[rowIndex], prepared.columns);
      if (!name) {
        nextStatuses[rowIndex] = "not_found";
        missing += 1;
        continue;
      }
      const rowCountries = countriesForRow(nextRows[rowIndex], prepared.columns);
      if (rowCountries.invalidCountry) {
        nextStatuses[rowIndex] = "invalid_country";
        failed += 1;
        continue;
      }
      setProgress(`Fila ${rowIndex + 1} de ${prepared.rows.length}: ${name}`);
      try {
        const res = await fetch("/api/apollo/attendee-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            title: searchBy.includes("cargo") ? searchTitle(nextRows[rowIndex], prepared.columns) : undefined,
            company: searchBy.includes("empresa") ? searchCompany(nextRows[rowIndex], prepared.columns) : undefined,
            all_countries: rowCountries.all_countries,
            countries: rowCountries.countries,
          }),
        });
        const { data, error } = await parseApiResponse<AttendeeMatchResult & { error?: string }>(res);
        if (runId.current !== thisRun) return;
        const message = error ?? data?.error ?? (!res.ok || !data ? `Error del servidor (${res.status})` : "");
        if (message || !data) {
          if (isFatal(message)) {
            fatal = message;
            break;
          }
          failed += 1;
          continue;
        }
        batchCredits += data.credits_consumed ?? 0;
        if (data.person?.email && data.person.telefono) {
          nextRows[rowIndex] = applyPersonToRow(nextRows[rowIndex], prepared.columns, fillFields, data.person);
          nextStatuses[rowIndex] = data.already_saved ? "already" : "filled";
          foundPeople.push(data.person);
        } else {
          nextStatuses[rowIndex] = data.status === "not_found" ? "not_found" : "no_contacts";
          missing += 1;
        }
        setStatuses([...nextStatuses]);
        setSheet({ ...prepared, rows: nextRows.map((row) => [...row]) });
      } catch (e) {
        if (runId.current !== thisRun) return;
        const raw = e instanceof Error ? e.message : "Error de red";
        if (isFatal(raw)) {
          fatal = raw;
          break;
        }
        failed += 1;
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
        } catch (e) {
          saveError = e instanceof Error ? e.message : "No se guardó en el portafolio. El Excel sí se puede descargar.";
        }
      }
    }

    if (runId.current !== thisRun) return;
    setBusy(false);
    setProgress(null);
    setCredits((current) => current + batchCredits);
    setSaved((current) => current + inserted);
    const left = nextStatuses.filter((status) => status === "pending").length;
    const invalidCountries = nextStatuses.filter((status) => status === "invalid_country").length;
    const summary = `${foundPeople.length} con móvil y correo · ${missing} sin coincidencia completa${invalidCountries ? ` · ${invalidCountries} con país no admitido` : ""}${failed ? ` · ${failed} con error` : ""} · ${inserted} al portafolio${left ? ` · faltan ${left}` : ""}${saveError ? `. ${saveError}` : "."}`;
    if (fatal) showWarning(`${summary} Se detuvo: ${fatal}`, "Tanda detenida");
    else if (saveError || !foundPeople.length) showWarning(summary, "Tanda terminada");
    else showSuccess(summary, "Tanda terminada");
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
          help="Carga un Excel o CSV de asistentes. El sistema detecta las columnas. Tú eliges por qué buscar (nombre, empresa, cargo) y qué completar (móvil, correo, LinkedIn…). Solo se rellena a las personas del archivo y solo viajan al portafolio quienes tienen móvil y correo. Cada tanda revisa 50 filas y gasta créditos de Apollo."
        />
      </header>

      {feedback && (
        <FeedbackAnchor className="mt-6">
          <ActionBanner tone={feedback.tone} title={feedback.title} message={feedback.message} onDismiss={clear} />
        </FeedbackAnchor>
      )}

      <section className="settings-panel mt-6">
        <p className="section-label">Archivo</p>
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
          <section className="settings-panel mt-4">
            <SectionLabel>Columnas detectadas</SectionLabel>
            <p className="text-micro mb-3">Corrige si alguna columna no quedó bien asignada.</p>
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

          <section className="settings-panel mt-4">
            <FieldLabel>País de búsqueda</FieldLabel>
            <p className="text-micro mb-2">
              {allCountries
                ? "Todos los países: busca en cualquier ubicación."
                : `Filtro activo: solo ${countriesCaption(false, countries)}.`}
            </p>
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

            <SectionLabel>Buscar por</SectionLabel>
            <p className="text-micro mb-2">Nombre es obligatorio. Empresa evita homónimos. Si el archivo trae País, se aplica en cada fila y prevalece sobre el selector global.</p>
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

            <SectionLabel>Completar en el archivo</SectionLabel>
            <p className="text-micro mb-2">Móvil y correo van siempre: sin ellos el contacto no entra al portafolio.</p>
            <div className="enrich-checks mb-4 flex flex-wrap gap-x-4 gap-y-2">
              {FILL_FIELDS.map((field) => (
                <label key={field.id} className="enrich-check inline-flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={fill.includes(field.id) || Boolean(field.required)}
                    disabled={busy || field.required}
                    onChange={() => toggleFill(field.id)}
                  />
                  {field.label}
                </label>
              ))}
            </div>

            <div className="document-upload mt-4">
              <button type="button" className="btn-primary inline-flex items-center gap-2" disabled={busy || pending === 0} onClick={() => void enrichBatch()}>
                <Sparkles size={16} strokeWidth={1.5} aria-hidden />
                {busy ? progress ?? "Enriqueciendo…" : `Enriquecer ${Math.min(MAX_ENRICH_BATCH, pending)} de ${pending}`}
              </button>
              <button type="button" className="btn-secondary inline-flex items-center gap-2" disabled={busy} onClick={() => void download()}>
                <Download size={16} strokeWidth={1.5} aria-hidden />
                Descargar archivo
              </button>
            </div>
            <p className="text-micro mt-2">
              {filled} completadas · {pending} pendientes
              {credits ? ` · ~${credits} créditos` : ""}
              {saved ? ` · ${saved} en portafolio` : ""}
            </p>
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
  if (status === "no_contacts") return "Sin móvil y correo";
  if (status === "not_found") return "No coincide";
  if (status === "invalid_country") return "País no admitido";
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
