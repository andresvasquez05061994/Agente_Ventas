"use client";

import { useState } from "react";
import type { ApolloPerson } from "@/lib/types";
import { EmptyState, SectionLabel } from "@/components/ui";

export default function ProspeccionPage() {
  const [pais, setPais] = useState("");
  const [cargo, setCargo] = useState("");
  const [keywords, setKeywords] = useState("");
  const [perPage, setPerPage] = useState(25);
  const [results, setResults] = useState<ApolloPerson[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [meta, setMeta] = useState<{ total_entries: number } | null>(null);

  async function search() {
    if (!pais && !cargo && !keywords) {
      setMessage("Ingresa al menos un criterio.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/apollo/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pais, cargo, keywords, per_page: perPage }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.results);
      setMeta(data.meta);
      setSelected(new Set());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error de búsqueda");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function save() {
    const toSave = results.filter((r) => selected.has(r.apollo_id));
    if (!toSave.length) {
      setMessage("Selecciona al menos un contacto.");
      return;
    }
    const fuente = [pais, cargo, keywords].filter(Boolean).join(" | ");
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leads: toSave, fuente }),
    });
    const data = await res.json();
    if (data.error) setMessage(data.error);
    else setMessage(`${data.inserted} guardado(s). ${data.skipped} duplicado(s).`);
  }

  return (
    <div className="flex w-full flex-1">
      <aside className="hidden w-[300px] shrink-0 border-r border-[#E2E6EA] bg-[#FAFBFC] p-5 dark:border-[#2A3544] dark:bg-[#151B23] lg:block">
        <SectionLabel>Contexto de búsqueda</SectionLabel>
        <label className="mb-1 block text-xs font-semibold text-[#1A2332] dark:text-[#E8EEF4]">País</label>
        <input className="input-field mb-3" value={pais} onChange={(e) => setPais(e.target.value)} placeholder="Colombia, México" />
        <label className="mb-1 block text-xs font-semibold">Cargo(s)</label>
        <input className="input-field mb-3" value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="CEO, Director" />
        <label className="mb-1 block text-xs font-semibold">Palabras clave</label>
        <input className="input-field mb-3" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="software, retail" />
        <SectionLabel>Parámetros</SectionLabel>
        <label className="mb-1 block text-xs font-semibold">Resultados: {perPage}</label>
        <input type="range" min={10} max={100} step={5} value={perPage} onChange={(e) => setPerPage(Number(e.target.value))} className="mb-4 w-full accent-[#003366]" />
        <button type="button" onClick={search} disabled={loading} className="btn-primary w-full">
          {loading ? "Buscando..." : "Ejecutar búsqueda"}
        </button>
      </aside>

      <main className="flex-1 p-6 lg:p-8">
        <h1 className="border-b-2 border-[#003366] pb-2 text-xl font-bold text-[#1A2332] dark:text-[#E8EEF4]">Prospección</h1>

        <div className="mt-4 lg:hidden space-y-3">
          <input className="input-field" placeholder="País" value={pais} onChange={(e) => setPais(e.target.value)} />
          <input className="input-field" placeholder="Cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} />
          <input className="input-field" placeholder="Keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
          <button type="button" onClick={search} className="btn-primary w-full">Buscar</button>
        </div>

        {message && <p className="mt-4 text-sm text-[#175CD3] dark:text-[#6BA3F7]">{message}</p>}

        {results.length === 0 ? (
          <div className="mt-8">
            <EmptyState message="Sin búsqueda activa" href="/prospeccion" cta="Nueva búsqueda" />
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm text-[#6B7C93]">
              {meta?.total_entries ?? results.length} resultados · {selected.size} seleccionados
            </p>
            <div className="mt-4 overflow-x-auto rounded border border-[#E2E6EA] dark:border-[#2A3544]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#F4F6F8] text-[11px] font-bold uppercase tracking-wider text-[#8A97A8] dark:bg-[#1A222D]">
                  <tr>
                    <th className="p-2">Sel.</th>
                    <th className="p-2">Nombre</th>
                    <th className="p-2">Cargo</th>
                    <th className="p-2">Empresa</th>
                    <th className="p-2">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.apollo_id} className="border-t border-[#E2E6EA] dark:border-[#2A3544]">
                      <td className="p-2">
                        <input type="checkbox" checked={selected.has(r.apollo_id)} onChange={() => toggle(r.apollo_id)} />
                      </td>
                      <td className="p-2 font-medium text-[#1A2332] dark:text-[#E8EEF4]">{r.nombre}</td>
                      <td className="p-2">{r.cargo ?? "—"}</td>
                      <td className="p-2">{r.empresa ?? "—"}</td>
                      <td className="p-2">{r.email ?? "—"}</td>
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
