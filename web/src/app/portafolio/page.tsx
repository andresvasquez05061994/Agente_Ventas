"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lead, LeadStatus } from "@/lib/types";
import { EmptyState, SectionLabel } from "@/components/ui";
import { useDebounce } from "@/hooks/use-debounce";

const STATUSES: LeadStatus[] = ["Nuevo", "En revisión", "Aprobado para contacto", "Descartado"];

export default function PortafolioPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [status, setStatus] = useState("Todos");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const q = new URLSearchParams();
    if (status !== "Todos") q.set("status", status);
    if (debouncedSearch) q.set("search", debouncedSearch);
    try {
      const res = await fetch(`/api/leads?${q}`);
      const data = await res.json();
      if (data.error) setMessage(data.error);
      else setLeads(data.leads);
    } catch {
      setMessage("No se pudo cargar el portafolio.");
    } finally {
      setLoading(false);
    }
  }, [status, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateStatus(id: number, lead_status: LeadStatus) {
    const prev = leads;
    setLeads((list) => list.map((l) => (l.id === id ? { ...l, lead_status } : l)));
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_status }),
      });
      if (!res.ok) {
        setLeads(prev);
        const data = await res.json();
        setMessage(data.error ?? "Error al actualizar estado");
      } else if (status !== "Todos" && lead_status !== status) {
        setLeads((list) => list.filter((l) => l.id !== id));
      }
    } catch {
      setLeads(prev);
      setMessage("Error de red al actualizar estado");
    }
  }

  async function clearPortfolio() {
    if (
      !window.confirm(
        "¿Eliminar todos los contactos del portafolio? Esta acción no se puede deshacer."
      )
    ) {
      return;
    }
    setClearing(true);
    setMessage("");
    try {
      const res = await fetch("/api/leads?confirm=true", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Error al vaciar portafolio");
      } else {
        setLeads([]);
        setMessage(`Portafolio vaciado (${data.deleted ?? 0} contactos eliminados).`);
      }
    } catch {
      setMessage("Error de red al vaciar portafolio");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="flex w-full flex-1">
      <aside className="hidden w-[300px] shrink-0 border-r border-[#E2E6EA] bg-[#FAFBFC] p-5 dark:border-[#2A3544] dark:bg-[#151B23] lg:block">
        <SectionLabel>Filtros</SectionLabel>
        <label className="mb-1 block text-xs font-semibold">Estado</label>
        <select className="input-field mb-3" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option>Todos</option>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <label className="mb-1 block text-xs font-semibold">Buscar</label>
        <input
          className="input-field"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nombre, empresa..."
        />
      </aside>

      <main className="flex-1 p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-[#003366] pb-2">
          <h1 className="text-xl font-bold text-[#1A2332] dark:text-[#E8EEF4]">Portafolio</h1>
          {leads.length > 0 && (
            <button
              type="button"
              onClick={clearPortfolio}
              disabled={clearing || loading}
              className="rounded border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
            >
              {clearing ? "Vaciando..." : "Vaciar portafolio"}
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-[#6B7C93]">
          Cada contacto guardado incluye email y teléfono verificados en la prospección.
        </p>
        {message && (
          <p
            className={`mt-4 text-sm ${message.includes("vaciado") ? "text-green-700 dark:text-green-400" : "text-red-600"}`}
          >
            {message}
          </p>
        )}

        {loading ? (
          <p className="mt-8 text-sm text-[#6B7C93]">Cargando...</p>
        ) : leads.length === 0 ? (
          <div className="mt-8">
            <EmptyState message="Sin contactos en el portafolio" href="/prospeccion" cta="Ir a Prospección" />
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded border border-[#E2E6EA] dark:border-[#2A3544]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#F4F6F8] text-[11px] font-bold uppercase tracking-wider text-[#8A97A8] dark:bg-[#1A222D]">
                <tr>
                  <th className="p-2">Nombre</th>
                  <th className="p-2">Cargo</th>
                  <th className="p-2">Empresa</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">Teléfono</th>
                  <th className="p-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-t border-[#E2E6EA] dark:border-[#2A3544]">
                    <td className="p-2 font-medium text-[#1A2332] dark:text-[#E8EEF4]">{l.nombre}</td>
                    <td className="p-2">{l.cargo ?? "—"}</td>
                    <td className="p-2">{l.empresa ?? "—"}</td>
                    <td className="p-2">
                      {l.email ? (
                        <a href={`mailto:${l.email}`} className="text-[#175CD3] hover:underline dark:text-[#6BA3F7]">
                          {l.email}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-2">
                      {l.telefono ? (
                        <a href={`tel:${l.telefono}`} className="text-[#175CD3] hover:underline dark:text-[#6BA3F7]">
                          {l.telefono}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-2">
                      <select
                        className="input-field py-1 text-xs"
                        value={l.lead_status}
                        onChange={(e) => updateStatus(l.id, e.target.value as LeadStatus)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
