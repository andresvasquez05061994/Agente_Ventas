"use client";

import { useState } from "react";
import type { ApolloPerson } from "@/lib/types";
import {
  APOLLO_COUNTRIES,
  APOLLO_JOB_TITLES,
  APOLLO_KEYWORDS,
  APOLLO_PER_PAGE_OPTIONS,
  APOLLO_SENIORITIES,
  DEFAULT_SEARCH,
} from "@/lib/apollo-filters";
import { SectionLabel } from "@/components/ui";

type SearchStatus = "idle" | "loading" | "success" | "empty" | "error";

function SearchFilters({
  country,
  setCountry,
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
}: {
  country: string;
  setCountry: (v: string) => void;
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
}) {
  return (
    <>
      <SectionLabel>Filtros Apollo</SectionLabel>
      <p className="mb-3 text-[11px] leading-relaxed text-[#6B7C93]">
        Solo listas validadas. Cada contacto incluye email y teléfono enriquecidos.
      </p>

      <label className="mb-1 block text-xs font-semibold text-[#1A2332] dark:text-[#E8EEF4]">
        País
      </label>
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

      <label className="mb-1 block text-xs font-semibold">Cargos</label>
      <div className="mb-3 max-h-44 space-y-1.5 overflow-y-auto rounded border border-[#E2E6EA] bg-white p-2 dark:border-[#2A3544] dark:bg-[#1A222D]">
        {APOLLO_JOB_TITLES.map((t) => (
          <label
            key={t.value}
            className="flex cursor-pointer items-start gap-2 text-xs text-[#3D4F63] dark:text-[#B8C5D3]"
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

      <label className="mb-1 block text-xs font-semibold">Industria</label>
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

      <label className="mb-1 block text-xs font-semibold">Seniority</label>
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

export default function ProspeccionPage() {
  const [country, setCountry] = useState(DEFAULT_SEARCH.country);
  const [titles, setTitles] = useState<string[]>(DEFAULT_SEARCH.titles);
  const [keyword, setKeyword] = useState(DEFAULT_SEARCH.keyword);
  const [seniority, setSeniority] = useState(DEFAULT_SEARCH.seniority);
  const [perPage, setPerPage] = useState(DEFAULT_SEARCH.perPage);

  const [results, setResults] = useState<ApolloPerson[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [message, setMessage] = useState("");
  const [meta, setMeta] = useState<{
    total_entries: number;
    with_contact_data?: number;
    scanned_profiles?: number;
  } | null>(null);

  function toggleTitle(value: string) {
    setTitles((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]
    );
  }

  async function search() {
    if (!titles.length) {
      setStatus("error");
      setMessage("Selecciona al menos un cargo de la lista.");
      return;
    }

    setStatus("loading");
    setMessage("");
    setResults([]);

    try {
      const res = await fetch("/api/apollo/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country,
          titles,
          keyword,
          seniority,
          per_page: perPage,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `Error del servidor (${res.status})`);
      }

      const list: ApolloPerson[] = data.results ?? [];
      setResults(list);
      setMeta(data.meta ?? null);
      setSelected(new Set());

      if (list.length === 0) {
        setStatus("empty");
        const scanned = data.meta?.scanned_profiles ?? 0;
        const total = data.meta?.total_entries ?? 0;
        if (data.meta?.apollo_zero_results) {
          setMessage(
            `Apollo no tiene perfiles para esta combinación (país + cargos + industria). ` +
              `Prueba «Todas las industrias» u otra como Software o Salud.`
          );
        } else if (scanned > 0) {
          setMessage(
            `Se revisaron ${scanned} perfiles en Apollo (${total} coincidencias) pero ninguno ` +
              `quedó con email y teléfono enriquecidos. Prueba más cargos o quita seniority.`
          );
        } else {
          setMessage(
            "No se encontraron contactos con email y teléfono. Ajusta los filtros e intenta de nuevo."
          );
        }
      } else {
        setStatus("success");
        const credits = data.meta?.credits_consumed ?? 0;
        const relaxed = data.meta?.industry_relaxed
          ? " · Industria ampliada (término alternativo en Apollo)"
          : "";
        setMessage(
          `${list.length} contacto(s) con email y teléfono · ` +
            `${data.meta?.total_entries ?? 0} coincidencias en Apollo` +
            (credits > 0 ? ` · ${credits} crédito(s) en esta búsqueda` : "") +
            relaxed
        );
      }
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Error de búsqueda");
      setResults([]);
      setMeta(null);
    }
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function selectAll() {
    setSelected(new Set(results.map((r) => r.apollo_id)));
  }

  async function save() {
    const toSave = results.filter((r) => selected.has(r.apollo_id));
    if (!toSave.length) {
      setMessage("Selecciona al menos un contacto.");
      setStatus("error");
      return;
    }

    const incomplete = toSave.filter((r) => !r.email?.trim() || !r.telefono?.trim());
    if (incomplete.length) {
      setStatus("error");
      setMessage(
        `${incomplete.length} contacto(s) sin email o teléfono. Solo se guardan contactos completos.`
      );
      return;
    }

    const fuente = [country, titles.join(", "), keyword || null, seniority || null]
      .filter(Boolean)
      .join(" | ");

    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leads: toSave, fuente }),
    });
    const data = await res.json();
    if (data.error) {
      setStatus("error");
      setMessage(data.error);
    } else {
      setStatus("success");
      const parts = [`${data.inserted} nuevo(s)`];
      if (data.updated) parts.push(`${data.updated} actualizado(s)`);
      if (data.skipped) parts.push(`${data.skipped} omitido(s)`);
      setMessage(`${parts.join(", ")} en portafolio (con email y teléfono).`);
    }
  }

  const messageClass =
    status === "error"
      ? "text-[#B42318] dark:text-[#F97066]"
      : status === "empty"
        ? "text-[#B54708] dark:text-[#FDB022]"
        : "text-[#175CD3] dark:text-[#6BA3F7]";

  return (
    <div className="flex w-full flex-1">
      <aside className="hidden w-[300px] shrink-0 border-r border-[#E2E6EA] bg-[#FAFBFC] p-5 dark:border-[#2A3544] dark:bg-[#151B23] lg:block">
        <SearchFilters
          country={country}
          setCountry={setCountry}
          titles={titles}
          toggleTitle={toggleTitle}
          keyword={keyword}
          setKeyword={setKeyword}
          seniority={seniority}
          setSeniority={setSeniority}
          perPage={perPage}
          setPerPage={setPerPage}
          loading={status === "loading"}
          onSearch={search}
        />
      </aside>

      <main className="flex-1 p-6 lg:p-8">
        <h1 className="border-b-2 border-[#003366] pb-2 text-xl font-bold text-[#1A2332] dark:text-[#E8EEF4]">
          Prospección
        </h1>

        <div className="mt-4 lg:hidden">
          <SearchFilters
            country={country}
            setCountry={setCountry}
            titles={titles}
            toggleTitle={toggleTitle}
            keyword={keyword}
            setKeyword={setKeyword}
            seniority={seniority}
            setSeniority={setSeniority}
            perPage={perPage}
            setPerPage={setPerPage}
            loading={status === "loading"}
            onSearch={search}
          />
        </div>

        {message && <p className={`mt-4 text-sm font-medium ${messageClass}`}>{message}</p>}

        {status === "loading" && (
          <div className="mt-12 flex flex-col items-center gap-3 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#003366] border-t-transparent dark:border-[#4A8FD4] dark:border-t-transparent" />
            <p className="text-sm text-[#6B7C93]">
              Buscando en Apollo y enriqueciendo email/teléfono…
              <br />
              <span className="text-xs">Puede tardar hasta 1 minuto.</span>
            </p>
          </div>
        )}

        {status === "idle" && (
          <div className="mt-12 flex min-h-[280px] flex-col items-center justify-center text-center">
            <p className="mb-2 text-sm font-medium text-[#1A2332] dark:text-[#E8EEF4]">
              Listo para buscar
            </p>
            <p className="max-w-md text-sm text-[#6B7C93]">
              Por defecto: Colombia + Director de TI. Solo verás contactos con email y teléfono
              confirmados por Apollo.
            </p>
          </div>
        )}

        {results.length > 0 && status !== "loading" && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[#6B7C93]">
              <span>{meta?.total_entries ?? results.length} en Apollo</span>
              <span>·</span>
              <span>{selected.size} seleccionados</span>
              <button
                type="button"
                onClick={selectAll}
                className="text-xs font-semibold text-[#003366] underline dark:text-[#6BA3F7]"
              >
                Seleccionar todos
              </button>
            </div>
            <div className="mt-4 overflow-x-auto rounded border border-[#E2E6EA] dark:border-[#2A3544]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#F4F6F8] text-[11px] font-bold uppercase tracking-wider text-[#8A97A8] dark:bg-[#1A222D]">
                  <tr>
                    <th className="p-2">Sel.</th>
                    <th className="p-2">Nombre</th>
                    <th className="p-2">Cargo</th>
                    <th className="p-2">Empresa</th>
                    <th className="p-2">Email</th>
                    <th className="p-2">Teléfono</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr
                      key={r.apollo_id}
                      className="border-t border-[#E2E6EA] dark:border-[#2A3544]"
                    >
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selected.has(r.apollo_id)}
                          onChange={() => toggle(r.apollo_id)}
                        />
                      </td>
                      <td className="p-2 font-medium text-[#1A2332] dark:text-[#E8EEF4]">
                        {r.nombre}
                      </td>
                      <td className="p-2">{r.cargo ?? "—"}</td>
                      <td className="p-2">{r.empresa ?? "—"}</td>
                      <td className="p-2">{r.email}</td>
                      <td className="p-2">{r.telefono}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={save} className="btn-primary mt-4">
              Guardar en portafolio
            </button>
          </>
        )}
      </main>
    </div>
  );
}
