"use client";

import { useState } from "react";
import {
  APOLLO_COUNTRIES,
  APOLLO_EMPLOYEE_RANGES,
  APOLLO_JOB_TITLES,
  APOLLO_JOB_TITLES_OTHER,
  APOLLO_KEYWORDS,
  APOLLO_PER_PAGE_OPTIONS,
  APOLLO_SENIORITIES,
  getAllPresetTitleValues,
  isPresetJobTitle,
  isValidJobTitle,
  sanitizeJobTitle,
} from "@/lib/apollo-filters";
import { HelpTip } from "@/components/HelpTip";
import { FieldLabel, SectionLabel, ActionBanner } from "@/components/ui";
import { CompanyAutocomplete } from "@/components/CompanyAutocomplete";
import { ExcelCompanySearch } from "@/components/ExcelCompanySearch";
import type { ExcelCompanyQueue } from "@/lib/excel-companies";

export type ApolloSearchFiltersProps = {
  country: string;
  setCountry: (v: string) => void;
  company: string;
  setCompany: (v: string) => void;
  titles: string[];
  setTitles: (titles: string[]) => void;
  toggleTitle: (value: string) => void;
  keyword: string;
  setKeyword: (v: string) => void;
  seniority: string;
  setSeniority: (v: string) => void;
  employeeRanges: string[];
  setEmployeeRanges: (v: string[]) => void;
  perPage: number;
  setPerPage: (v: number) => void;
  loading: boolean;
  onSearch: () => void;
  excelQueue: ExcelCompanyQueue | null;
  onExcelLoaded: (queue: ExcelCompanyQueue) => void;
  onExcelCleared: () => void;
  onSearchCompanies: () => void;
};

function TitleCheckboxList({
  items,
  titles,
  toggleTitle,
  loading,
}: {
  items: readonly { label: string; value: string }[];
  titles: string[];
  toggleTitle: (value: string) => void;
  loading: boolean;
}) {
  return (
    <div className="apollo-titles-list" role="group">
      {items.map((t) => (
        <label key={t.value} className="apollo-titles-item">
          <input
            type="checkbox"
            checked={titles.includes(t.value)}
            onChange={() => toggleTitle(t.value)}
            disabled={loading}
          />
          <span>{t.label}</span>
        </label>
      ))}
    </div>
  );
}

export function ApolloSearchFilters({
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
  loading,
  onSearch,
  excelQueue,
  onExcelLoaded,
  onExcelCleared,
  onSearchCompanies,
}: ApolloSearchFiltersProps) {
  const excelMode = Boolean(excelQueue);
  const [customTitle, setCustomTitle] = useState("");
  const [customError, setCustomError] = useState("");
  const [customSuccess, setCustomSuccess] = useState("");

  const customTitles = titles.filter((t) => !isPresetJobTitle(t));
  const allPresetsSelected = getAllPresetTitleValues().every((v) => titles.includes(v));

  function selectAllPresets() {
    const customs = titles.filter((t) => !isPresetJobTitle(t));
    setTitles([...getAllPresetTitleValues(), ...customs]);
  }

  function addCustomTitle() {
    const value = sanitizeJobTitle(customTitle);
    if (!isValidJobTitle(value)) {
      setCustomError("Escribe un cargo válido (mín. 2 caracteres).");
      return;
    }
    if (titles.some((t) => t.toLowerCase() === value.toLowerCase())) {
      setCustomError("Ese cargo ya está seleccionado.");
      return;
    }
    setTitles([...titles, value]);
    setCustomTitle("");
    setCustomError("");
    setCustomSuccess(`«${value}» agregado a la búsqueda.`);
    window.setTimeout(() => setCustomSuccess(""), 4000);
  }

  function removeCustomTitle(value: string) {
    setTitles(titles.filter((t) => t !== value));
  }

  const excelBlockedReason = titles.length ? null : "Selecciona al menos un cargo o pulsa Todos.";

  return (
    <>
      <ExcelCompanySearch
        disabled={loading}
        queue={excelQueue}
        searchBlockedReason={excelBlockedReason}
        onLoad={onExcelLoaded}
        onClear={onExcelCleared}
        onSearch={onSearchCompanies}
      />

      <div className="field-label-row">
        <SectionLabel>{excelMode ? "Filtros del archivo" : "Filtros Apollo"}</SectionLabel>
        <HelpTip label="Filtros">
          {excelMode
            ? "Con un Excel cargado, la búsqueda general queda en pausa. Quita el archivo para volver a buscar por filtros."
            : "Cada resultado trae email y teléfono. Apollo cobra esos créditos en tu cuenta."}
        </HelpTip>
      </div>

      <FieldLabel>{excelMode ? "País de las empresas" : "País"}</FieldLabel>
      <select
        className="input-field mb-3"
        value={country}
        onChange={(e) => setCountry(e.target.value)}
      >
        {APOLLO_COUNTRIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>

      {!excelMode && (
        <CompanyAutocomplete
          value={company}
          onChange={setCompany}
          country={country}
          disabled={loading}
        />
      )}

      <div className="apollo-titles-header">
        <div className="field-label-row">
          <FieldLabel className="!mb-0">Cargos</FieldLabel>
          <HelpTip label="Cargos">
            {excelMode
              ? "Todos trae cualquier cargo que Apollo tenga en la empresa. Si marcas cargos, solo trae esos."
              : "Marca cargos de la lista o agrega uno libre. En inglés suele encontrar más en Apollo."}
          </HelpTip>
        </div>
        <div className="apollo-titles-header__actions">
          <button
            type="button"
            className="apollo-titles-link"
            onClick={selectAllPresets}
            disabled={loading || allPresetsSelected}
          >
            Todos
          </button>
          <span className="apollo-titles-header__sep" aria-hidden>
            ·
          </span>
          <button
            type="button"
            className="apollo-titles-link"
            onClick={() => setTitles([])}
            disabled={loading || titles.length === 0}
          >
            Ninguno
          </button>
        </div>
      </div>

      <p className="apollo-titles-group-label">IA, automatización y transformación</p>
      <TitleCheckboxList
        items={APOLLO_JOB_TITLES}
        titles={titles}
        toggleTitle={toggleTitle}
        loading={loading}
      />

      <p className="apollo-titles-group-label">RRHH, logística y otros</p>
      <TitleCheckboxList
        items={APOLLO_JOB_TITLES_OTHER}
        titles={titles}
        toggleTitle={toggleTitle}
        loading={loading}
      />

      <FieldLabel className="!mt-2">Otro cargo</FieldLabel>
      <div className="apollo-titles-custom-row">
        <input
          type="text"
          className="input-field"
          value={customTitle}
          onChange={(e) => {
            setCustomTitle(e.target.value);
            setCustomError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustomTitle();
            }
          }}
          placeholder="Ej: Warehouse Manager, HR Business Partner…"
          maxLength={80}
          disabled={loading}
        />
        <button
          type="button"
          className="btn-secondary apollo-titles-custom-add"
          onClick={addCustomTitle}
          disabled={loading || !customTitle.trim()}
        >
          Agregar
        </button>
      </div>
      {customError && (
        <ActionBanner compact tone="error" title="Cargo inválido" message={customError} />
      )}
      {customSuccess && !customError && (
        <div className="mb-2">
          <ActionBanner compact tone="success" title="Cargo agregado" message={customSuccess} />
        </div>
      )}
      {customTitles.length > 0 && (
        <div className="apollo-titles-chips">
          {customTitles.map((t) => (
            <span key={t} className="apollo-titles-chip">
              {t}
              <button
                type="button"
                className="apollo-titles-chip__remove"
                onClick={() => removeCustomTitle(t)}
                disabled={loading}
                aria-label={`Quitar ${t}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {titles.length > 0 && !(excelMode && allPresetsSelected) ? (
        <p className="text-micro apollo-titles-hint">{titles.length} cargos seleccionados</p>
      ) : null}

      {!excelMode && (
        <>
          <FieldLabel>Industria</FieldLabel>
          <select
            className="input-field mb-3"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          >
            {APOLLO_KEYWORDS.map((k) => (
              <option key={k.label} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </>
      )}

      <FieldLabel>Seniority</FieldLabel>
      <select
        className="input-field mb-3"
        value={seniority}
        onChange={(e) => setSeniority(e.target.value)}
      >
        {APOLLO_SENIORITIES.map((s) => (
          <option key={s.label} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      {!excelMode && (
        <>
          <FieldLabel>Tamaño de empresa</FieldLabel>
          <select
            className="input-field mb-3"
            value={employeeRanges[0] ?? ""}
            onChange={(e) => setEmployeeRanges(e.target.value ? [e.target.value] : [])}
          >
            {APOLLO_EMPLOYEE_RANGES.map((r) => (
              <option key={r.label} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </>
      )}

      <div className="field-label-row">
        <SectionLabel>{excelMode ? "Contactos por empresa" : "Resultados por lote"}</SectionLabel>
        {!excelMode ? (
          <HelpTip label="Resultados por lote">
            Máximo 25 por lote. Si hay más coincidencias, carga el siguiente lote. Cada lote nuevo gasta créditos.
          </HelpTip>
        ) : null}
      </div>
      <select
        className={`input-field ${excelMode ? "mb-4" : "mb-2"}`}
        value={perPage}
        onChange={(e) => setPerPage(Number(e.target.value))}
      >
        {APOLLO_PER_PAGE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {excelMode ? `${n} por empresa (con email y teléfono)` : `${n} contactos (con email y teléfono)`}
          </option>
        ))}
      </select>
      {excelMode ? (
        <p className="text-micro">Búsqueda general en pausa mientras el Excel esté cargado.</p>
      ) : (
        <div className="filter-action">
        <button
          type="button"
          onClick={onSearch}
          disabled={loading}
          className="btn-primary w-full disabled:opacity-60"
        >
          {loading ? "Buscando…" : "Ejecutar búsqueda"}
        </button>
        </div>
      )}
    </>
  );
}
