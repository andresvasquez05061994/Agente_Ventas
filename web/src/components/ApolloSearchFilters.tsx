"use client";

import {
  APOLLO_COUNTRIES,
  APOLLO_JOB_TITLES,
  APOLLO_KEYWORDS,
  APOLLO_PER_PAGE_OPTIONS,
  APOLLO_SENIORITIES,
} from "@/lib/apollo-filters";
import { FieldLabel, SectionLabel } from "@/components/ui";

export type ApolloSearchFiltersProps = {
  country: string;
  setCountry: (v: string) => void;
  company: string;
  setCompany: (v: string) => void;
  titles: string[];
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

export function ApolloSearchFilters({
  country,
  setCountry,
  company,
  setCompany,
  titles,
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

      <FieldLabel>Empresa</FieldLabel>
      <input
        type="text"
        className="input-field mb-3"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        placeholder="Ej: Bancolombia, Grupo Éxito, Sura…"
        maxLength={120}
      />
      <p className="text-micro mb-3 -mt-2">
        Opcional. Filtra contactos dentro de esa organización en Apollo.
      </p>

      <FieldLabel>Cargos</FieldLabel>
      <div className="mb-3 max-h-44 space-y-1.5 overflow-y-auto rounded border border-[#E2E6EA] bg-white p-2 dark:border-[#2A3544] dark:bg-[#1A222D]">
        {APOLLO_JOB_TITLES.map((t) => (
          <label
            key={t.value}
            className="flex cursor-pointer items-start gap-2 text-[12px] text-[#6B7C93] dark:text-[#B8C5D3]"
          >
            <input
              type="checkbox"
              className="mt-0.5 accent-[#003366]"
              checked={titles.includes(t.value)}
              onChange={() => toggleTitle(t.value)}
            />
            <span>{t.label}</span>
          </label>
        ))}
      </div>

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
