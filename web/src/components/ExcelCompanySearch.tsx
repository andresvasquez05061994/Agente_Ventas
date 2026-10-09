"use client";

import { useId, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { ActionBanner, FieldLabel } from "@/components/ui";
import {
  MAX_EXCEL_COMPANIES,
  readCompanyNamesFromBuffer,
  type ExcelCompanyExtract,
} from "@/lib/excel-companies";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function ExcelCompanySearch({
  disabled,
  titlesSelected,
  perPage,
  onSearchCompanies,
}: {
  disabled: boolean;
  titlesSelected: number;
  perPage: number;
  onSearchCompanies: (payload: { companies: string[]; totalFound: number }) => void;
}) {
  const inputId = useId();
  const [reading, setReading] = useState(false);
  const [fileLabel, setFileLabel] = useState("");
  const [extract, setExtract] = useState<ExcelCompanyExtract | null>(null);
  const [error, setError] = useState("");

  async function onFile(file: File | undefined) {
    setError("");
    setExtract(null);
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
    setFileLabel(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = await readCompanyNamesFromBuffer(buffer, file.name);
      if (!parsed.totalFound) {
        setExtract(null);
        setError(
          "No encontré nombres de empresa. Usa una columna con encabezado Empresa, Compañía o Company."
        );
        return;
      }
      setExtract(parsed);
    } catch {
      setExtract(null);
      setError("No se pudo leer el archivo. Ábrelo en Excel y guárdalo de nuevo como .xlsx.");
    } finally {
      setReading(false);
    }
  }

  const preview = extract?.companies.slice(0, 6) ?? [];
  const hiddenCount = extract ? Math.max(0, extract.companies.length - preview.length) : 0;
  const canSearch = !disabled && !reading && titlesSelected > 0 && (extract?.companies.length ?? 0) > 0;

  return (
    <div className="mb-3">
      <FieldLabel>Empresas desde Excel</FieldLabel>
      <p className="text-micro mb-2">
        Sube un Excel o CSV con el nombre de la empresa. Se buscan hasta {perPage} contactos por
        empresa, con los cargos y el país de estos filtros, para guardarlos en el portafolio.
      </p>
      <label
        htmlFor={inputId}
        className={`btn-secondary w-full cursor-pointer ${disabled || reading ? "pointer-events-none opacity-50" : ""}`}
      >
        <FileSpreadsheet size={14} strokeWidth={1.5} aria-hidden />
        {reading ? "Leyendo archivo…" : "Cargar Excel"}
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

      {extract && extract.companies.length > 0 && (
        <div className="mt-2">
          <p className="text-caption">
            {fileLabel ? `${fileLabel}: ` : ""}
            {extract.totalFound} empresa(s)
            {extract.columnLabel ? ` · columna «${extract.columnLabel}»` : ""}
          </p>
          <ul className="text-micro mt-1 max-h-24 list-disc overflow-y-auto pl-4">
            {preview.map((name) => (
              <li key={name}>{name}</li>
            ))}
            {hiddenCount > 0 && <li>y {hiddenCount} más en esta tanda</li>}
          </ul>
          {extract.truncated && (
            <p className="text-micro mt-1">
              El archivo tiene {extract.totalFound} empresas. Esta búsqueda usa las primeras{" "}
              {MAX_EXCEL_COMPANIES} para no agotar los créditos de Apollo.
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
                companies: extract.companies,
                totalFound: extract.totalFound,
              })
            }
          >
            Buscar contactos de estas empresas
          </button>
        </div>
      )}
    </div>
  );
}
