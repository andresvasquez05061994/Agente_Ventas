"use client";

import { useState } from "react";
import {
  APOLLO_COUNTRIES,
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
import { FieldLabel, SectionLabel, ActionBanner } from "@/components/ui";
import { CompanyAutocomplete } from "@/components/CompanyAutocomplete";

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
  perPage: number;
  setPerPage: (v: number) => void;
  loading: boolean;
  onSearch: () => void;
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
  perPage,
  setPerPage,
  loading,
  onSearch,
}: ApolloSearchFiltersProps) {
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

  return (
    <>
      <SectionLabel>Filtros Apollo</SectionLabel>
      <p className="text-caption mb-3">
        Solo listas validadas. Cada contacto incluye email y teléfono enriquecidos.
      </p>

      <FieldLabel>País</FieldLabel>
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

      <CompanyAutocomplete
        value={company}
        onChange={setCompany}
        country={country}
        disabled={loading}
      />

      <div className="apollo-titles-header">
        <FieldLabel className="!mb-0">Cargos</FieldLabel>
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

      <p className="apollo-titles-group-label">IA, automatización y demanda</p>
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

      <p className="text-micro apollo-titles-hint">
        Selecciona de la lista o agrega cargos libres (ideal en inglés para Apollo).
        {titles.length > 0 && (
          <span className="apollo-titles-count"> · {titles.length} seleccionados</span>
        )}
      </p>

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

      <SectionLabel>Resultados</SectionLabel>
      <select
        className="input-field mb-4"
        value={perPage}
        onChange={(e) => setPerPage(Number(e.target.value))}
      >
        {APOLLO_PER_PAGE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n} contactos (con email y teléfono)
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={onSearch}
        disabled={loading}
        className="btn-primary w-full disabled:opacity-60"
      >
        {loading ? "Buscando y enriqueciendo..." : "Ejecutar búsqueda"}
      </button>
    </>
  );
}
