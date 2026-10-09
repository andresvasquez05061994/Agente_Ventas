"use client";

import { useId, useState } from "react";
import { FileSpreadsheet, X } from "lucide-react";
import { ActionBanner } from "@/components/ui";
import {
  createExcelQueue,
  excelQueueStats,
  nextPendingBatch,
  readCompanyNamesFromBuffer,
  type ExcelCompanyEntry,
  type ExcelCompanyQueue,
} from "@/lib/excel-companies";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

function statusLabel(entry: ExcelCompanyEntry): string {
  if (entry.status === "found") return `${entry.contacts} contacto${entry.contacts === 1 ? "" : "s"}`;
  if (entry.status === "no_contacts") return "Sin contactos";
  if (entry.status === "not_found") return "No está en Apollo";
  return "Por revisar";
}

export function ExcelCompanySearch({
  disabled,
  queue,
  searchBlockedReason,
  onLoad,
  onClear,
  onSearch,
}: {
  disabled: boolean;
  queue: ExcelCompanyQueue | null;
  searchBlockedReason: string | null;
  onLoad: (queue: ExcelCompanyQueue) => void;
  onClear: () => void;
  onSearch: () => void;
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
      setError("El archivo supera 2 MB. Deja solo la columna de empresas y vuelve a subirlo.");
      return;
    }
    setReading(true);
    try {
      const parsed = await readCompanyNamesFromBuffer(await file.arrayBuffer(), file.name);
      if (!parsed.totalFound) {
        setError("No encontré nombres de empresa. Usa una columna con encabezado Empresa, Compañía o Company.");
        return;
      }
      onLoad(createExcelQueue(file.name, parsed.columnLabel, parsed.companies));
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

  if (!queue) {
    return (
      <div className="excel-card">
        <p className="excel-card__title">Empresas desde Excel</p>
        <p className="text-micro mb-2">
          Busca contactos solo dentro de las empresas de tu archivo (columna Empresa, Compañía o Company).
        </p>
        <label
          htmlFor={inputId}
          className={`btn-secondary w-full cursor-pointer ${disabled || reading ? "pointer-events-none opacity-50" : ""}`}
        >
          <FileSpreadsheet size={14} strokeWidth={1.5} aria-hidden />
          {reading ? "Leyendo archivo…" : "Cargar Excel"}
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

  const stats = excelQueueStats(queue);
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
          <p className="excel-card__title">Empresas desde Excel</p>
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
          <span className="excel-stat__label">Empresas cargadas</span>
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

      <details className="excel-companies">
        <summary>Ver estado por empresa</summary>
        <ul>
          {queue.entries.map((entry) => (
            <li key={entry.name}>
              <span className="excel-companies__name" title={entry.apolloName ? `En Apollo: ${entry.apolloName}` : entry.name}>
                {entry.name}
              </span>
              <span className={`excel-chip excel-chip--${entry.status}`}>{statusLabel(entry)}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
