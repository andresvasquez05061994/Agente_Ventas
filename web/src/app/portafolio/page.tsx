"use client";

import { useEffect, useState } from "react";
import type { Lead, LeadStatus } from "@/lib/types";
import { EmptyState, FieldLabel, PageSubtitle, SectionLabel } from "@/components/ui";
import { useDebounce } from "@/hooks/use-debounce";
import { downloadLeadsCsv } from "@/lib/export-leads";

const STATUSES: LeadStatus[] = ["Nuevo", "En revisión", "Aprobado para contacto", "Descartado"];
const CONTACT_FILTERS = ["Todos", "Con teléfono", "Sin teléfono", "Con email", "Sin email"] as const;
const PER_PAGE = 20;

function getPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 9) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result: (number | "…")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("…");
    result.push(sorted[i]);
  }
  return result;
}

function PortfolioPagination({
  page,
  totalPages,
  total,
  perPage,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <div className="portfolio-pagination">
      <p className="text-caption">
        Mostrando {from}–{to} de {total.toLocaleString("es-CO")} contactos
      </p>
      <nav className="portfolio-pagination__nav" aria-label="Paginación del portafolio">
        <button
          type="button"
          className="portfolio-pagination__btn"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Anterior
        </button>
        {getPageNumbers(page, totalPages).map((p, i) =>
          p === "…" ? (
            <span key={`ellipsis-${i}`} className="portfolio-pagination__ellipsis">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={`portfolio-pagination__btn ${p === page ? "portfolio-pagination__btn--active" : ""}`}
              onClick={() => onPageChange(p)}
              aria-current={p === page ? "page" : undefined}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          className="portfolio-pagination__btn"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Siguiente
        </button>
      </nav>
    </div>
  );
}

function PortfolioFilters({
  status,
  setStatus,
  contact,
  setContact,
  search,
  setSearch,
  onFilterChange,
}: {
  status: string;
  setStatus: (v: string) => void;
  contact: string;
  setContact: (v: string) => void;
  search: string;
  setSearch: (v: string) => void;
  onFilterChange: () => void;
}) {
  return (
    <>
      <SectionLabel>Filtros</SectionLabel>
      <FieldLabel>Estado</FieldLabel>
      <select
        className="input-field mb-3"
        value={status}
        onChange={(e) => {
          onFilterChange();
          setStatus(e.target.value);
        }}
      >
        <option>Todos</option>
        {STATUSES.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <FieldLabel>Contacto</FieldLabel>
      <select
        className="input-field mb-3"
        value={contact}
        onChange={(e) => {
          onFilterChange();
          setContact(e.target.value);
        }}
      >
        {CONTACT_FILTERS.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <FieldLabel>Buscar</FieldLabel>
      <input
        className="input-field"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Nombre, empresa..."
      />
    </>
  );
}

export default function PortafolioPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState("Todos");
  const [contact, setContact] = useState("Todos");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<LeadStatus>("En revisión");
  const [editingNotes, setEditingNotes] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const pendingSearch = search !== debouncedSearch;
  const showLoading = loading || pendingSearch;

  function markReloading() {
    setLoading(true);
    setMessage("");
    setPage(1);
  }

  function buildLeadsQuery(targetPage: number) {
    const q = new URLSearchParams({
      page: String(targetPage),
      per_page: String(PER_PAGE),
    });
    if (status !== "Todos") q.set("status", status);
    if (debouncedSearch) q.set("search", debouncedSearch);
    if (contact !== "Todos") q.set("contact", contact);
    return q;
  }

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/leads?${buildLeadsQuery(page)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) setMessage(data.error);
        else {
          setLeads(data.leads ?? []);
          setTotal(data.total ?? 0);
          setTotalPages(data.totalPages ?? 1);
          if (data.page && data.page !== page) setPage(data.page);
          setSelected(new Set());
        }
      })
      .catch(() => {
        if (!cancelled) setMessage("No se pudo cargar el portafolio.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, debouncedSearch, contact, page]);

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
        setTotal((t) => Math.max(0, t - 1));
      }
    } catch {
      setLeads(prev);
      setMessage("Error de red al actualizar estado");
    }
  }

  async function bulkUpdateStatus() {
    const ids = Array.from(selected);
    if (!ids.length) return;

    setBulkUpdating(true);
    setMessage("");
    const prev = leads;
    setLeads((list) =>
      list.map((l) => (selected.has(l.id) ? { ...l, lead_status: bulkStatus } : l))
    );

    try {
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/leads/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lead_status: bulkStatus }),
          })
        )
      );
      const failed = results.some((r) => !r.ok);
      if (failed) {
        setLeads(prev);
        setMessage("Error al actualizar el estado de uno o más contactos.");
      } else {
        if (status !== "Todos" && bulkStatus !== status) {
          setLeads((list) => list.filter((l) => !selected.has(l.id)));
          setTotal((t) => Math.max(0, t - ids.length));
        }
        setMessage(`${ids.length} contacto(s) marcados como «${bulkStatus}».`);
        setSelected(new Set());
      }
    } catch {
      setLeads(prev);
      setMessage("Error de red al actualizar estados.");
    } finally {
      setBulkUpdating(false);
    }
  }

  function openNotes(lead: Lead) {
    setEditingNotes(lead.id);
    setNotesDraft(lead.notas ?? "");
  }

  async function saveNotes(id: number) {
    setSavingNotes(true);
    const prev = leads;
    setLeads((list) =>
      list.map((l) => (l.id === id ? { ...l, notas: notesDraft.trim() || null } : l))
    );
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notas: notesDraft.trim() || null }),
      });
      if (!res.ok) {
        setLeads(prev);
        const data = await res.json();
        setMessage(data.error ?? "Error al guardar notas");
      } else {
        setEditingNotes(null);
        setMessage("Notas guardadas.");
      }
    } catch {
      setLeads(prev);
      setMessage("Error de red al guardar notas");
    } finally {
      setSavingNotes(false);
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
        setTotal((t) => Math.max(0, t - count));
        if (leads.length === count && page > 1) {
          setPage(page - 1);
        }
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
        setTotal(0);
        setPage(1);
        setMessage(`Portafolio vaciado (${data.deleted ?? 0} contactos eliminados).`);
      }
    } catch {
      setMessage("Error de red al vaciar portafolio");
    } finally {
      setClearing(false);
    }
  }

  async function exportCsv() {
    const q = buildLeadsQuery(1);
    q.set("all", "true");
    try {
      const res = await fetch(`/api/leads?${q}`);
      const data = await res.json();
      if (data.error) {
        setMessage(data.error);
        return;
      }
      downloadLeadsCsv(data.leads ?? []);
    } catch {
      setMessage("No se pudo exportar el portafolio.");
    }
  }

  const isSuccessMessage =
    message.includes("vaciado") ||
    message.includes("eliminado") ||
    message.includes("marcados") ||
    message.includes("Notas guardadas");

  return (
    <div className="flex w-full flex-1">
      <aside className="hidden w-[300px] shrink-0 border-r border-[#E2E6EA] bg-[#FAFBFC] p-5 dark:border-[#2A3544] dark:bg-[#151B23] lg:block">
        <PortfolioFilters
          status={status}
          setStatus={setStatus}
          contact={contact}
          setContact={setContact}
          search={search}
          setSearch={setSearch}
          onFilterChange={markReloading}
        />
      </aside>

      <main className="flex-1 p-6 lg:p-8">
        <div className="page-header flex flex-wrap items-start justify-between gap-3">
          <h1 className="page-title">Portafolio</h1>
          {total > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={exportCsv}
                disabled={showLoading}
                className="btn-secondary"
              >
                Exportar CSV ({total})
              </button>
              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={deleteSelected}
                  disabled={deleting || clearing || showLoading}
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
                disabled={clearing || deleting || showLoading}
                className="btn-danger"
              >
                {clearing ? "Vaciando..." : "Vaciar portafolio"}
              </button>
            </div>
          )}
        </div>
        <PageSubtitle>
          {total > 0
            ? `${total.toLocaleString("es-CO")} contacto(s) guardados · ${PER_PAGE} por página. Cada uno incluye email y teléfono verificados.`
            : "Cada contacto guardado incluye email y teléfono verificados en la prospección."}
        </PageSubtitle>

        <div className="mt-4 lg:hidden">
          <PortfolioFilters
            status={status}
            setStatus={setStatus}
            contact={contact}
            setContact={setContact}
            search={search}
            setSearch={setSearch}
            onFilterChange={markReloading}
          />
        </div>

        {selected.size > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded border border-[#E2E6EA] bg-[#FAFBFC] p-3 dark:border-[#2A3544] dark:bg-[#151B23]">
            <span className="text-caption">{selected.size} seleccionado(s)</span>
            <select
              className="input-field py-1"
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value as LeadStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={bulkUpdateStatus}
              disabled={bulkUpdating || showLoading}
              className="btn-primary"
            >
              {bulkUpdating ? "Actualizando..." : "Cambiar estado"}
            </button>
          </div>
        )}

        {message && (
          <p
            className={`text-caption mt-4 ${isSuccessMessage ? "text-green-700 dark:text-green-400" : "text-red-600"}`}
          >
            {message}
          </p>
        )}

        {showLoading ? (
          <p className="text-body mt-8">Cargando...</p>
        ) : total === 0 ? (
          <div className="mt-8">
            <EmptyState message="Sin contactos en el portafolio" href="/prospeccion" cta="Ir a Prospección" />
          </div>
        ) : (
          <>
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
                  <th>Notas</th>
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
                    <td>{l.email ? <a href={`mailto:${l.email}`}>{l.email}</a> : "—"}</td>
                    <td>{l.telefono ? <a href={`tel:${l.telefono}`}>{l.telefono}</a> : "—"}</td>
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
                    <td className="max-w-[200px]">
                      {editingNotes === l.id ? (
                        <div className="space-y-1">
                          <textarea
                            className="input-field min-h-[60px] w-full text-[12px]"
                            value={notesDraft}
                            onChange={(e) => setNotesDraft(e.target.value)}
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => saveNotes(l.id)}
                              disabled={savingNotes}
                              className="btn-link"
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingNotes(null)}
                              className="btn-link"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" onClick={() => openNotes(l)} className="btn-link text-left">
                          {l.notas?.trim() ? l.notas : "Añadir notas"}
                        </button>
                      )}
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
          <PortfolioPagination
            page={page}
            totalPages={totalPages}
            total={total}
            perPage={PER_PAGE}
            onPageChange={(p) => {
              setLoading(true);
              setPage(p);
              setSelected(new Set());
            }}
          />
          </>
        )}
      </main>
    </div>
  );
}
