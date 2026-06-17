"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lead, LeadStatus } from "@/lib/types";
import { EmptyState, FieldLabel, PageSubtitle, SectionLabel } from "@/components/ui";
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
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

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
      else {
        setLeads(data.leads);
        setSelected(new Set());
      }
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

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === leads.length) setSelected(new Set());
    else setSelected(new Set(leads.map((l) => l.id)));
  }

  async function deleteContacts(ids: number[], names: string[]) {
    const count = ids.length;
    const prompt =
      count === 1
        ? `¿Eliminar a ${names[0]} del portafolio? Esta acción no se puede deshacer.`
        : `¿Eliminar ${count} contactos del portafolio? Esta acción no se puede deshacer.`;
    if (!window.confirm(prompt)) return;

    setDeleting(true);
    setMessage("");
    const prev = leads;
    const idSet = new Set(ids);
    setLeads((list) => list.filter((l) => !idSet.has(l.id)));
    setSelected((prevSel) => {
      const next = new Set(prevSel);
      ids.forEach((id) => next.delete(id));
      return next;
    });

    try {
      const results = await Promise.all(
        ids.map((id) => fetch(`/api/leads/${id}`, { method: "DELETE" }))
      );
      const failed = results.some((r) => !r.ok);
      if (failed) {
        setLeads(prev);
        setMessage("Error al eliminar uno o más contactos.");
      } else {
        setMessage(
          count === 1 ? `Contacto eliminado: ${names[0]}.` : `${count} contactos eliminados.`
        );
      }
    } catch {
      setLeads(prev);
      setMessage("Error de red al eliminar contactos.");
    } finally {
      setDeleting(false);
    }
  }

  function deleteSelected() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const names = leads.filter((l) => selected.has(l.id)).map((l) => l.nombre);
    deleteContacts(ids, names);
  }

  function deleteOne(lead: Lead) {
    deleteContacts([lead.id], [lead.nombre]);
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
        setSelected(new Set());
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
        <FieldLabel>Estado</FieldLabel>
        <select className="input-field mb-3" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option>Todos</option>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <FieldLabel>Buscar</FieldLabel>
        <input
          className="input-field"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nombre, empresa..."
        />
      </aside>

      <main className="flex-1 p-6 lg:p-8">
        <div className="page-header flex flex-wrap items-start justify-between gap-3">
          <h1 className="page-title">Portafolio</h1>
          {leads.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={deleteSelected}
                  disabled={deleting || clearing || loading}
                  className="btn-danger"
                >
                  {deleting
                    ? "Eliminando..."
                    : selected.size === 1
                      ? "Eliminar seleccionado"
                      : `Eliminar seleccionados (${selected.size})`}
                </button>
              )}
              <button
                type="button"
                onClick={clearPortfolio}
                disabled={clearing || deleting || loading}
                className="btn-danger"
              >
                {clearing ? "Vaciando..." : "Vaciar portafolio"}
              </button>
            </div>
          )}
        </div>
        <PageSubtitle>
          Cada contacto guardado incluye email y teléfono verificados en la prospección.
        </PageSubtitle>
        {message && (
          <p
            className={`text-caption mt-4 ${message.includes("vaciado") || message.includes("eliminado") ? "text-green-700 dark:text-green-400" : "text-red-600"}`}
          >
            {message}
          </p>
        )}

        {loading ? (
          <p className="text-body mt-8">Cargando...</p>
        ) : leads.length === 0 ? (
          <div className="mt-8">
            <EmptyState message="Sin contactos en el portafolio" href="/prospeccion" cta="Ir a Prospección" />
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded border border-[#E2E6EA] dark:border-[#2A3544]">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-10">
                    <input
                      type="checkbox"
                      checked={leads.length > 0 && selected.size === leads.length}
                      onChange={toggleSelectAll}
                      aria-label="Seleccionar todos"
                      className="h-3.5 w-3.5 rounded border-[#C8D0D8]"
                    />
                  </th>
                  <th>Nombre</th>
                  <th>Cargo</th>
                  <th>Empresa</th>
                  <th>Email</th>
                  <th>Teléfono</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(l.id)}
                        onChange={() => toggleSelect(l.id)}
                        aria-label={`Seleccionar ${l.nombre}`}
                        className="h-3.5 w-3.5 rounded border-[#C8D0D8]"
                      />
                    </td>
                    <td className="cell-strong">{l.nombre}</td>
                    <td>{l.cargo ?? "—"}</td>
                    <td>{l.empresa ?? "—"}</td>
                    <td>
                      {l.email ? <a href={`mailto:${l.email}`}>{l.email}</a> : "—"}
                    </td>
                    <td>
                      {l.telefono ? <a href={`tel:${l.telefono}`}>{l.telefono}</a> : "—"}
                    </td>
                    <td>
                      <select
                        className="input-field py-1"
                        value={l.lead_status}
                        onChange={(e) => updateStatus(l.id, e.target.value as LeadStatus)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => deleteOne(l)}
                        disabled={deleting || clearing}
                        className="btn-link-danger"
                      >
                        Eliminar
                      </button>
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
