"use client";

import { useId, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { ActionBanner, FieldLabel } from "@/components/ui";
import {
  excelCoverageMessage,
  nextCompanyBatch,
  readCompanyNamesFromBuffer,
  type ExcelCompanyQueue,
} from "@/lib/excel-companies";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export type ExcelSearchPayload = {
  queueId: number;
  companies: string[];
  total: number;
  from: number;
  to: number;
  deliveredBefore: number;
};

export function ExcelCompanySearch({
  disabled,
  titlesSelected,
  perPage,
  queue,
  onExcelLoaded,
  onSearchCompanies,
}: {
  disabled: boolean;
  titlesSelected: number;
  perPage: number;
  queue: ExcelCompanyQueue | null;
  onExcelLoaded: (queue: ExcelCompanyQueue) => void;
  onSearchCompanies: (payload: ExcelSearchPayload) => void;
}) {
  const inputId = useId();
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");

  async function onFile(file: File | undefined) {
    setError("");
    if (!file) return;

    const name = file.name.toLowerCase();
    if (!/\.(xlsx|xls|csv)$/.test(name)) {
      setError("Usa un archivo Excel (.xlsx, .xls) o CSV.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("El archivo supera 2 MB. Deja solo la columna de empresas y vuelve a subirlo.");
      return;
    }

    setReading(true);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = await readCompanyNamesFromBuffer(buffer, file.name);
      if (!parsed.totalFound) {
        setError(
          "No encontré nombres de empresa. Usa una columna con encabezado Empresa, Compañía o Company."
        );
        return;
      }
      onExcelLoaded({
        id: Date.now(),
        fileLabel: file.name,
        columnLabel: parsed.columnLabel,
        companies: parsed.companies,
        delivered: 0,
      });
    } catch {
      setError("No se pudo leer el archivo. Ábrelo en Excel y guárdalo de nuevo como .xlsx.");
    } finally {
      setReading(false);
    }
  }

  const batch = queue ? nextCompanyBatch(queue.companies, queue.delivered) : null;
  const coverage = queue ? excelCoverageMessage(queue.delivered, queue.companies.length) : null;
  const preview = batch?.companies.slice(0, 6) ?? [];
  const hiddenCount = batch ? Math.max(0, batch.companies.length - preview.length) : 0;
  const canSearch = Boolean(batch && batch.companies.length > 0 && !disabled && !reading && titlesSelected > 0);

  const buttonLabel = !batch || batch.companies.length === 0
    ? "Base revisada"
    : queue && queue.delivered > 0
      ? `Siguientes ${batch.companies.length} empresas (${batch.from}–${batch.to})`
      : `Buscar empresas ${batch.from}–${batch.to}`;

  return (
    <div className="mb-3">
      <FieldLabel>Empresas desde Excel</FieldLabel>
      <p className="text-micro mb-2">
        Sube un Excel o CSV con el nombre de la empresa. Cada consulta revisa hasta 20 empresas y{" "}
        {perPage} contactos por empresa, con los cargos y el país de estos filtros.
      </p>
      <label
        htmlFor={inputId}
        className={`btn-secondary w-full cursor-pointer ${disabled || reading ? "pointer-events-none opacity-50" : ""}`}
      >
        <FileSpreadsheet size={14} strokeWidth={1.5} aria-hidden />
        {reading ? "Leyendo archivo…" : queue ? "Cargar otro Excel" : "Cargar Excel"}
      </label>
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

      {error && (
        <div className="mt-2">
          <ActionBanner compact tone="error" title="Excel no leído" message={error} />
        </div>
      )}

      {queue && coverage && batch && (
        <div className="mt-2">
          <p className="text-caption">
            {queue.fileLabel}
            {queue.columnLabel ? ` · columna «${queue.columnLabel}»` : ""}
          </p>
          <div className="mt-2">
            <ActionBanner
              compact
              tone={queue.delivered > 0 && batch.companies.length === 0 ? "success" : "info"}
              title={coverage.title}
              message={coverage.detail}
            />
          </div>
          {batch.companies.length > 0 && (
            <>
              <p className="text-micro mt-2">
                Próxima consulta: empresas {batch.from}–{batch.to} de {batch.total}.
              </p>
              <ul className="text-micro mt-1 max-h-24 list-disc overflow-y-auto pl-4">
                {preview.map((name) => (
                  <li key={`${batch.from}-${name}`}>{name}</li>
                ))}
                {hiddenCount > 0 && <li>y {hiddenCount} más en esta tanda</li>}
              </ul>
              {queue.delivered > 0 && (
                <p className="text-micro mt-1">
                  Guarda en el portafolio los contactos de esta tanda antes de continuar. La siguiente
                  consulta reemplaza la lista en pantalla.
                </p>
              )}
              {titlesSelected === 0 && (
                <p className="text-micro mt-1">Selecciona al menos un cargo antes de buscar.</p>
              )}
              <button
                type="button"
                className="btn-primary mt-2 w-full disabled:opacity-60"
                disabled={!canSearch}
                onClick={() =>
                  onSearchCompanies({
                    queueId: queue.id,
                    companies: batch.companies,
                    total: batch.total,
                    from: batch.from,
                    to: batch.to,
                    deliveredBefore: queue.delivered,
                  })
                }
              >
                {buttonLabel}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
