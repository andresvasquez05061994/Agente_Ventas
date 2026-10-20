"use client";

import { useId, useState } from "react";
import { FileSpreadsheet, X } from "lucide-react";
import { HelpTip } from "@/components/HelpTip";
import { ActionBanner } from "@/components/ui";
import {
  createExcelQueue,
  excelQueueStats,
  extractCompanyNames,
  nextPendingBatch,
  readWorkbookMatrix,
  type ExcelCompanyEntry,
  type ExcelCompanyQueue,
} from "@/lib/excel-companies";
import {
  attendeeQueueStats,
  createAttendeeQueue,
  extractAttendees,
  isAttendeeMatrix,
  MAX_ATTENDEE_ROWS,
  MAX_ATTENDEES_PER_BATCH,
  nextPendingAttendees,
  type AttendeeEntry,
  type AttendeeQueue,
} from "@/lib/excel-attendees";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

function statusLabel(entry: ExcelCompanyEntry): string {
  if (entry.status === "found") return `${entry.contacts} contacto${entry.contacts === 1 ? "" : "s"}`;
  if (entry.status === "no_contacts") return "Sin contactos";
  if (entry.status === "not_found") return "No está en Apollo";
  return "Por revisar";
}

function attendeeStatusLabel(entry: AttendeeEntry): string {
  if (entry.status === "found") return "Con móvil y correo";
  if (entry.status === "no_contacts") return "Sin móvil y correo";
  if (entry.status === "not_found") return "No está en Apollo";
  return "Por revisar";
}

export function ExcelCompanySearch({
  disabled,
  queue,
  attendeeQueue,
  searchBlockedReason,
  onLoad,
  onLoadAttendees,
  onClear,
  onSearch,
  onSearchAttendees,
}: {
  disabled: boolean;
  queue: ExcelCompanyQueue | null;
  attendeeQueue: AttendeeQueue | null;
  searchBlockedReason: string | null;
  onLoad: (queue: ExcelCompanyQueue) => void;
  onLoadAttendees: (queue: AttendeeQueue) => void;
  onClear: () => void;
  onSearch: () => void;
  onSearchAttendees: () => void;
}) {
  const inputId = useId();
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");

  async function onFile(file: File | undefined) {
    setError("");
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setError("Usa un archivo Excel (.xlsx, .xls) o CSV.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("El archivo supera 2 MB. Deja solo las columnas de nombre y empresa y vuelve a subirlo.");
      return;
    }
    setReading(true);
    try {
      const matrix = await readWorkbookMatrix(await file.arrayBuffer(), file.name);
      if (isAttendeeMatrix(matrix)) {
        const extracted = extractAttendees(matrix);
        if (!extracted?.attendees.length) {
          setError("No encontré filas con nombre y empresa. Revisa que el encabezado diga Nombre y Empresa.");
          return;
        }
        if (extracted.attendees.length > MAX_ATTENDEE_ROWS) {
          setError(`El archivo trae ${extracted.attendees.length} personas. Máximo ${MAX_ATTENDEE_ROWS}. Divídelo y vuelve a subirlo.`);
          return;
        }
        onLoadAttendees(createAttendeeQueue(file.name, extracted));
        return;
      }
      const parsed = extractCompanyNames(matrix);
      if (!parsed.totalFound) {
        setError("No encontré nombres de empresa. Usa Nombre+Empresa (asistentes) o una columna Empresa.");
        return;
      }
      onLoad(createExcelQueue(file.name, parsed.columnLabel, parsed.companies, parsed.loadStats));
    } catch {
      setError("No se pudo leer el archivo. Ábrelo en Excel y guárdalo de nuevo como .xlsx.");
    } finally {
      setReading(false);
    }
  }

  const fileInput = (
    <input
      id={inputId}
      type="file"
      accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
      className="hidden"
      disabled={disabled || reading}
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        void onFile(file);
      }}
    />
  );

  if (!queue && !attendeeQueue) {
    return (
      <div className="excel-card">
        <div className="page-heading mb-2">
          <p className="excel-card__title">Archivo de empresas o asistentes</p>
          <HelpTip label="Excel o CSV">
            Lista de asistentes (Nombre, Cargo, Empresa) o solo empresas. La búsqueda solo trae contactos con móvil y correo.
          </HelpTip>
        </div>
        <label
          htmlFor={inputId}
          className={`btn-secondary w-full cursor-pointer ${disabled || reading ? "pointer-events-none opacity-50" : ""}`}
        >
          <FileSpreadsheet size={14} strokeWidth={1.5} aria-hidden />
          {reading ? "Leyendo archivo…" : "Cargar Excel o CSV"}
        </label>
        {fileInput}
        {error && (
          <div className="mt-2">
            <ActionBanner compact tone="error" title="Excel no leído" message={error} />
          </div>
        )}
      </div>
    );
  }

  if (attendeeQueue) {
    const stats = attendeeQueueStats(attendeeQueue);
    const batch = nextPendingAttendees(attendeeQueue);
    const progress = stats.total ? Math.round((stats.reviewed / stats.total) * 100) : 0;
    const from = stats.reviewed + 1;
    const to = stats.reviewed + batch.length;
    const buttonLabel =
      stats.reviewed === 0
        ? `Buscar contactos · ${from}–${to} de ${stats.total}`
        : `Siguientes ${batch.length} · ${from}–${to} de ${stats.total}`;

    return (
      <div className="excel-card">
        <div className="excel-card__head">
          <div className="min-w-0">
            <div className="page-heading">
              <p className="excel-card__title">Asistentes del archivo</p>
              <HelpTip label="Asistentes">
                Busca a cada persona por nombre, cargo y empresa. Solo se muestran si Apollo entrega móvil y correo. {MAX_ATTENDEES_PER_BATCH} por lote para no gastar el presupuesto de un clic.
              </HelpTip>
            </div>
            <p className="excel-card__file" title={attendeeQueue.fileLabel}>
              {attendeeQueue.fileLabel}
            </p>
          </div>
          <button
            type="button"
            className="excel-card__close"
            onClick={onClear}
            disabled={disabled}
            aria-label="Quitar archivo"
            title="Quitar archivo"
          >
            <X size={14} strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        <div className="excel-stats">
          <div className="excel-stat">
            <span className="excel-stat__value">{stats.total}</span>
            <span className="excel-stat__label">Personas</span>
          </div>
          <div className="excel-stat">
            <span className="excel-stat__value">{stats.found}</span>
            <span className="excel-stat__label">Con móvil y correo</span>
          </div>
          <div className="excel-stat">
            <span className="excel-stat__value">{stats.noContacts + stats.notFound}</span>
            <span className="excel-stat__label">Sin contacto completo</span>
          </div>
          <div className="excel-stat">
            <span className="excel-stat__value">{stats.pending}</span>
            <span className="excel-stat__label">Por revisar</span>
          </div>
        </div>

        <div className="excel-progress" aria-label={`${stats.reviewed} de ${stats.total} personas revisadas`}>
          <div className="excel-progress__bar" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-micro mt-1">
          {stats.reviewed} de {stats.total} revisadas
          {stats.pending > 0 ? ` · ${stats.pending} por revisar` : ""}
        </p>

        {batch.length > 0 ? (
          <button
            type="button"
            className="btn-primary mt-3 w-full disabled:opacity-60"
            disabled={disabled}
            onClick={onSearchAttendees}
          >
            {buttonLabel}
          </button>
        ) : (
          <p className="excel-card__done">Se revisaron todas las personas del archivo.</p>
        )}

        <details className="excel-companies">
          <summary>Ver estado por persona</summary>
          <ul>
            {attendeeQueue.entries.slice(0, 80).map((entry) => (
              <li key={entry.id}>
                <span className="excel-companies__name" title={`${entry.rawName} · ${entry.rawCompany}`}>
                  {entry.name} · {entry.company}
                </span>
                <span className={`excel-chip excel-chip--${entry.status}`}>{attendeeStatusLabel(entry)}</span>
              </li>
            ))}
          </ul>
          {attendeeQueue.entries.length > 80 ? (
            <p className="text-micro">Mostrando las primeras 80 de {attendeeQueue.entries.length}.</p>
          ) : null}
        </details>
      </div>
    );
  }

  if (!queue) return null;

  const stats = excelQueueStats(queue);
  const load = queue.loadStats ?? {
    rowsInColumn: stats.total,
    unique: stats.total,
    skippedEmpty: 0,
    skippedInvalid: 0,
    skippedDuplicate: 0,
    skipped: [],
  };
  const skippedTotal = load.skippedDuplicate + load.skippedEmpty + load.skippedInvalid;
  const batch = nextPendingBatch(queue);
  const progress = stats.total ? Math.round((stats.reviewed / stats.total) * 100) : 0;
  const from = stats.reviewed + 1;
  const to = stats.reviewed + batch.length;
  const buttonLabel =
    stats.reviewed === 0
      ? `Buscar contactos · empresas ${from}–${to} de ${stats.total}`
      : `Siguientes ${batch.length} · empresas ${from}–${to} de ${stats.total}`;

  return (
    <div className="excel-card">
      <div className="excel-card__head">
        <div className="min-w-0">
          <div className="page-heading">
            <p className="excel-card__title">Empresas desde Excel</p>
            <HelpTip label="Empresas desde Excel">
              Revisa el archivo por lotes. Quitar el archivo vuelve a la búsqueda general.
            </HelpTip>
          </div>
          <p className="excel-card__file" title={queue.fileLabel}>
            {queue.fileLabel}
          </p>
        </div>
        <button
          type="button"
          className="excel-card__close"
          onClick={onClear}
          disabled={disabled}
          aria-label="Quitar archivo"
          title="Quitar archivo"
        >
          <X size={14} strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      <div className="excel-stats">
        <div className="excel-stat">
          <span className="excel-stat__value">{stats.total}</span>
          <span className="excel-stat__label">
            {load.rowsInColumn > stats.total
              ? `Únicas de ${load.rowsInColumn} filas`
              : "Empresas cargadas"}
          </span>
        </div>
        <div className="excel-stat">
          <span className="excel-stat__value">{stats.contacts}</span>
          <span className="excel-stat__label">Contactos encontrados</span>
        </div>
        <div className="excel-stat">
          <span className="excel-stat__value">{stats.withContacts}</span>
          <span className="excel-stat__label">Empresas con contactos</span>
        </div>
        <div className="excel-stat">
          <span className="excel-stat__value">{stats.withoutContacts}</span>
          <span className="excel-stat__label">Faltan por asignar</span>
        </div>
      </div>

      <div className="excel-progress" aria-label={`${stats.reviewed} de ${stats.total} empresas revisadas`}>
        <div className="excel-progress__bar" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-micro mt-1">
        {stats.reviewed} de {stats.total} revisadas
        {stats.pending > 0 ? ` · ${stats.pending} por revisar` : ""}
        {stats.noContacts + stats.notFound > 0
          ? ` · ${stats.noContacts + stats.notFound} sin contactos en Apollo`
          : ""}
      </p>

      {batch.length > 0 ? (
        <>
          <button
            type="button"
            className="btn-primary mt-3 w-full disabled:opacity-60"
            disabled={disabled || Boolean(searchBlockedReason)}
            onClick={onSearch}
          >
            {buttonLabel}
          </button>
          {searchBlockedReason && <p className="text-micro mt-1">{searchBlockedReason}</p>}
        </>
      ) : (
        <p className="excel-card__done">Se revisaron todas las empresas del archivo.</p>
      )}

      {skippedTotal > 0 && (
        <p className="text-micro mt-1">
          {[
            load.skippedDuplicate ? `${load.skippedDuplicate} repetida(s)` : "",
            load.skippedEmpty ? `${load.skippedEmpty} vacía(s)` : "",
            load.skippedInvalid ? `${load.skippedInvalid} inválida(s)` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
          {load.skippedDuplicate ? " (misma razón social, no se consultan dos veces)" : ""}.
        </p>
      )}

      <details className="excel-companies">
        <summary>Ver estado por empresa</summary>
        <ul>
          {queue.entries.map((entry) => (
            <li key={entry.name}>
              <span
                className="excel-companies__name"
                title={[
                  entry.rawName !== entry.name ? `Celda: ${entry.rawName}` : "",
                  entry.alias ? `Sigla: ${entry.alias}` : "",
                  entry.apolloName ? `En Apollo: ${entry.apolloName}` : "",
                ]
                  .filter(Boolean)
                  .join("\n") || entry.name}
              >
                {entry.name}
              </span>
              <span className={`excel-chip excel-chip--${entry.status}`}>{statusLabel(entry)}</span>
            </li>
          ))}
        </ul>
      </details>
      {load.skipped.filter((row) => row.reason !== "empty").length > 0 && (
        <details className="excel-companies">
          <summary>Filas omitidas ({skippedTotal})</summary>
          <ul>
            {load.skipped
              .filter((row) => row.reason !== "empty")
              .map((row, index) => (
                <li key={`${row.reason}-${index}`}>
                  <span className="excel-companies__name" title={row.rawName}>
                    {row.rawName || "(vacía)"}
                  </span>
                  <span className="excel-chip">
                    {row.reason === "duplicate" ? `Igual a ${row.duplicateOf}` : "Inválida"}
                  </span>
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
