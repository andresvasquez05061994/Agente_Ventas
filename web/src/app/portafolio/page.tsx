"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Lead, LeadStatus } from "@/lib/types";
import { EmptyState, FieldLabel, PageSubtitle, SectionLabel, ActionBanner, FeedbackAnchor } from "@/components/ui";
import { MessageIAPanel } from "@/components/MessageIAPanel";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { useDebounce } from "@/hooks/use-debounce";
import { downloadLeadsCsv } from "@/lib/export-leads";
import type { ColdCallResult, ColdEmailResult, OutreachChannel } from "@/lib/commercial-outreach";

const STATUSES: LeadStatus[] = ["Nuevo", "En revisión", "Aprobado para contacto", "Descartado"];
const CONTACT_FILTERS = ["Todos", "Con teléfono", "Sin teléfono", "Con email", "Sin email"] as const;
const PER_PAGE = 20;

const STATUS_SHORT: Record<LeadStatus, string> = {
  Nuevo: "Nuevo",
  "En revisión": "En revisión",
  "Aprobado para contacto": "Aprobado",
  Descartado: "Descartado",
};

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
        onChange={(e) => {
          onFilterChange();
          setSearch(e.target.value);
        }}
        placeholder="Nombre, empresa..."
      />
    </>
  );
}

export default function PortafolioPage() {
  return (
    <Suspense fallback={<p className="text-body mt-8 p-5 lg:p-7">Cargando portafolio…</p>}>
      <PortafolioContent />
    </Suspense>
  );
}

function PortafolioContent() {
  const searchParams = useSearchParams();
  const openLastPage = searchParams.get("page") === "last";
  const [leads, setLeads] = useState<Lead[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState("Todos");
  const [contact, setContact] = useState("Todos");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const { feedback, showSuccess, showError, showWarning, clear } = useActionFeedback();
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<LeadStatus>("En revisión");
  const [editingNotes, setEditingNotes] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [messageIALead, setMessageIALead] = useState<Lead | null>(null);
  const [messageIAChannel, setMessageIAChannel] = useState<OutreachChannel>("call");
  const [callResult, setCallResult] = useState<ColdCallResult | null>(null);
  const [emailResult, setEmailResult] = useState<ColdEmailResult | null>(null);
  const [messageIALoading, setMessageIALoading] = useState(false);
  const [messageIAError, setMessageIAError] = useState("");
  const [messageIALeadId, setMessageIALeadId] = useState<number | null>(null);
  const [statusSavingId, setStatusSavingId] = useState<number | null>(null);

  const pendingSearch = search !== debouncedSearch;
  const showLoading = loading || pendingSearch;

  function markReloading() {
    setLoading(true);
    clear();
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
    let cancelled = false;

    fetch(`/api/leads?${buildLeadsQuery(page)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) showError(data.error, "Error al cargar");
        else {
          if (openLastPage && data.totalPages && page !== data.totalPages) {
            setPage(data.totalPages);
            return;
          }
          setLeads(data.leads ?? []);
          setTotal(data.total ?? 0);
          setTotalPages(data.totalPages ?? 1);
          if (data.page && data.page !== page) setPage(data.page);
          setSelected(new Set());
        }
      })
      .catch(() => {
        if (!cancelled) showError("No se pudo cargar el portafolio.", "Error al cargar");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, debouncedSearch, contact, page, openLastPage]);

  async function updateStatus(id: number, lead_status: LeadStatus) {
    const prev = leads;
    setStatusSavingId(id);
    setLeads((list) =>
      list.map((l) => (Number(l.id) === id ? { ...l, lead_status } : l))
    );
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_status }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.lead) {
        setLeads(prev);
        showError(data.error ?? "Error al actualizar estado", "Estado no actualizado");
        return;
      }

      const saved = data.lead as Lead;
      setLeads((list) => list.map((l) => (Number(l.id) === id ? saved : l)));
      showSuccess(`Contacto marcado como «${saved.lead_status}».`, "Estado actualizado");

      if (status !== "Todos" && saved.lead_status !== status) {
        setLeads((list) => list.filter((l) => Number(l.id) !== id));
        setTotal((t) => Math.max(0, t - 1));
      }
    } catch {
      setLeads(prev);
      showError("Error de red al actualizar estado", "Estado no actualizado");
    } finally {
      setStatusSavingId(null);
    }
  }

  async function bulkUpdateStatus() {
    const ids = Array.from(selected);
    if (!ids.length) {
      showWarning("Selecciona al menos un contacto para cambiar el estado.", "Sin selección");
      return;
    }

    setBulkUpdating(true);
    clear();
    const prev = leads;
    setLeads((list) =>
      list.map((l) => (selected.has(l.id) ? { ...l, lead_status: bulkStatus } : l))
    );

    try {
      const results = await Promise.all(
        ids.map(async (id) => {
          const res = await fetch(`/api/leads/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lead_status: bulkStatus }),
            cache: "no-store",
          });
          const data = await res.json();
          return { id, ok: res.ok && Boolean(data.lead), lead: data.lead as Lead | undefined };
        })
      );
      const failed = results.some((r) => !r.ok);
      if (failed) {
        setLeads(prev);
        showError("Error al actualizar el estado de uno o más contactos.", "Cambio masivo fallido");
      } else {
        const savedById = new Map(results.map((r) => [r.id, r.lead!]));
        setLeads((list) =>
          list.map((l) => savedById.get(Number(l.id)) ?? l)
        );
        if (status !== "Todos" && bulkStatus !== status) {
          setLeads((list) => list.filter((l) => !selected.has(Number(l.id))));
          setTotal((t) => Math.max(0, t - ids.length));
        }
        showSuccess(
          `${ids.length} contacto(s) marcados como «${bulkStatus}».`,
          "Estados actualizados"
        );
        setSelected(new Set());
      }
    } catch {
      setLeads(prev);
      showError("Error de red al actualizar estados.", "Cambio masivo fallido");
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
      list.map((l) => (Number(l.id) === id ? { ...l, notas: notesDraft.trim() || null } : l))
    );
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notas: notesDraft.trim() || null }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.lead) {
        setLeads(prev);
        showError(data.error ?? "Error al guardar notas", "Notas no guardadas");
      } else {
        setLeads((list) =>
          list.map((l) => (Number(l.id) === id ? (data.lead as Lead) : l))
        );
        setEditingNotes(null);
        showSuccess("Las notas del contacto se guardaron correctamente.", "Notas guardadas");
      }
    } catch {
      setLeads(prev);
      showError("Error de red al guardar notas", "Notas no guardadas");
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
    clear();
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
        showError("Error al eliminar uno o más contactos.", "Eliminación fallida");
      } else {
        setTotal((t) => Math.max(0, t - count));
        if (leads.length === count && page > 1) {
          setPage(page - 1);
        }
        showSuccess(
          count === 1 ? `Se eliminó a ${names[0]} del portafolio.` : `Se eliminaron ${count} contactos del portafolio.`,
          "Contactos eliminados"
        );
      }
    } catch {
      setLeads(prev);
      showError("Error de red al eliminar contactos.", "Eliminación fallida");
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

  async function fetchOutreach(lead: Lead, channel: OutreachChannel) {
    setMessageIALead(lead);
    setMessageIAChannel(channel);
    setMessageIAError("");
    setMessageIALoading(true);
    setMessageIALeadId(lead.id);

    if (channel === "call") setCallResult(null);
    else setEmailResult(null);

    try {
      const res = await fetch("/api/portafolio/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          nombre: lead.nombre,
          cargo: lead.cargo,
          empresa: lead.empresa,
          pais: lead.pais,
          email: lead.email,
          notas: lead.notas,
          fuente: lead.fuente_busqueda,
          linkedin_url: lead.linkedin_url,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "Error al generar mensaje");
      }
      if (channel === "email") {
        setEmailResult(data as ColdEmailResult);
      } else {
        setCallResult(data as ColdCallResult);
      }
    } catch (e) {
      setMessageIAError(e instanceof Error ? e.message : "Error al generar mensaje comercial");
    } finally {
      setMessageIALoading(false);
    }
  }

  function openMessageIA(lead: Lead) {
    setCallResult(null);
    setEmailResult(null);
    void fetchOutreach(lead, "call");
  }

  function changeMessageIAChannel(channel: OutreachChannel) {
    if (!messageIALead || messageIAChannel === channel) return;
    setMessageIAChannel(channel);
    if (channel === "call" && callResult) return;
    if (channel === "email" && emailResult) return;
    void fetchOutreach(messageIALead, channel);
  }

  function closeMessageIA() {
    setMessageIALead(null);
    setCallResult(null);
    setEmailResult(null);
    setMessageIAError("");
    setMessageIALoading(false);
    setMessageIALeadId(null);
    setMessageIAChannel("call");
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
    clear();
    try {
      const res = await fetch("/api/leads?confirm=true", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error ?? "Error al vaciar portafolio", "Portafolio no vaciado");
      } else {
        setLeads([]);
        setSelected(new Set());
        setTotal(0);
        setPage(1);
        showSuccess(
          `Se eliminaron ${data.deleted ?? 0} contactos. El portafolio quedó vacío.`,
          "Portafolio vaciado"
        );
      }
    } catch {
      showError("Error de red al vaciar portafolio", "Portafolio no vaciado");
    } finally {
      setClearing(false);
    }
  }

  async function exportCsv() {
    const q = buildLeadsQuery(1);
    q.set("all", "true");
    setExporting(true);
    clear();
    try {
      const res = await fetch(`/api/leads?${q}`);
      const data = await res.json();
      if (data.error) {
        showError(data.error, "Exportación fallida");
        return;
      }
      const rows = data.leads ?? [];
      downloadLeadsCsv(rows);
      showSuccess(
        `Se descargó un CSV con ${rows.length} contacto(s) según los filtros actuales.`,
        "Exportación completada"
      );
    } catch {
      showError("No se pudo exportar el portafolio.", "Exportación fallida");
    } finally {
      setExporting(false);
    }
  }

  const busy = showLoading || clearing || deleting || exporting || bulkUpdating;

  return (
    <div className="flex w-full flex-1">
      <aside className="filter-sidebar hidden w-[280px] shrink-0 border-r border-[#E2E6EA] bg-[#FAFBFC] dark:border-[#2A3544] dark:bg-[#151B23] lg:block">
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

      <main className="min-w-0 flex-1 p-5 lg:p-7">
        <div className="page-header flex flex-wrap items-start justify-between gap-3">
          <h1 className="page-title">Portafolio</h1>
          {total > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={exportCsv}
                disabled={busy}
                className="btn-secondary"
              >
                {exporting ? "Exportando…" : `Exportar CSV (${total})`}
              </button>
              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={deleteSelected}
                  disabled={deleting || clearing || busy}
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
                disabled={clearing || deleting || busy}
                className="btn-danger"
              >
                {clearing ? "Vaciando..." : "Vaciar portafolio"}
              </button>
            </div>
          )}
        </div>
        <PageSubtitle>
          {total > 0
            ? `${total.toLocaleString("es-CO")} contacto(s) guardados · ${PER_PAGE} por página. Orden: del más antiguo al más reciente (los nuevos al final).`
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
              disabled={bulkUpdating || busy}
              className="btn-primary"
            >
              {bulkUpdating ? "Actualizando..." : "Cambiar estado"}
            </button>
          </div>
        )}

        {feedback && (
          <FeedbackAnchor>
            <ActionBanner {...feedback} onDismiss={clear} />
          </FeedbackAnchor>
        )}

        {showLoading ? (
          <p className="text-body mt-8">Cargando...</p>
        ) : total === 0 ? (
          <div className="mt-8">
            <EmptyState message="Sin contactos en el portafolio" href="/prospeccion" cta="Ir a Prospección" />
          </div>
        ) : (
          <>
          <div className="portfolio-table-wrap mt-6 rounded border border-[#E2E6EA] dark:border-[#2A3544]">
            <table className="data-table portfolio-table">
              <colgroup>
                <col style={{ width: 32 }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: 180 }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: 108 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 52 }} />
                <col style={{ width: 76 }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="portfolio-table__check">
                    <input
                      type="checkbox"
                      checked={leads.length > 0 && selected.size === leads.length}
                      onChange={toggleSelectAll}
                      aria-label="Seleccionar todos"
                    />
                  </th>
                  <th className="portfolio-table__name">Nombre</th>
                  <th className="portfolio-table__role">Cargo</th>
                  <th className="portfolio-table__company">Empresa</th>
                  <th className="portfolio-table__email">Email</th>
                  <th className="portfolio-table__phone">Teléfono</th>
                  <th className="portfolio-table__status">Estado</th>
                  <th className="portfolio-table__notes">Notas</th>
                  <th className="portfolio-table__ia">IA</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr
                    key={l.id}
                    className={editingNotes === l.id ? "portfolio-row--notes-editing" : undefined}
                  >
                    <td className="portfolio-table__check">
                      <input
                        type="checkbox"
                        checked={selected.has(l.id)}
                        onChange={() => toggleSelect(l.id)}
                        aria-label={`Seleccionar ${l.nombre}`}
                      />
                    </td>
                    <td className="portfolio-table__name cell-strong" title={l.nombre}>
                      {l.nombre}
                    </td>
                    <td className="portfolio-table__role" title={l.cargo ?? undefined}>
                      {l.cargo ?? "—"}
                    </td>
                    <td className="portfolio-table__company" title={l.empresa ?? undefined}>
                      {l.empresa ?? "—"}
                    </td>
                    <td className="portfolio-table__email">
                      {l.email ? (
                        <a href={`mailto:${l.email}`} title={l.email}>
                          {l.email}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="portfolio-table__phone">
                      {l.telefono ? (
                        <a href={`tel:${l.telefono}`} title={l.telefono}>
                          {l.telefono}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="portfolio-table__status">
                      <select
                        className="portfolio-status-select"
                        value={l.lead_status}
                        title={l.lead_status}
                        disabled={statusSavingId === Number(l.id)}
                        onChange={(e) => updateStatus(Number(l.id), e.target.value as LeadStatus)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_SHORT[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="portfolio-table__notes">
                      {editingNotes === l.id ? (
                        <div className="portfolio-notes-edit">
                          <textarea
                            className="input-field portfolio-notes-textarea"
                            value={notesDraft}
                            onChange={(e) => setNotesDraft(e.target.value)}
                            rows={2}
                          />
                          <div className="portfolio-notes-actions">
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
                        <button
                          type="button"
                          onClick={() => openNotes(l)}
                          className="portfolio-notes-link"
                          title={l.notas?.trim() || "Añadir notas"}
                        >
                          {l.notas?.trim() ? "Ver" : "Notas"}
                        </button>
                      )}
                    </td>
                    <td className="portfolio-table__ia">
                      {editingNotes !== l.id && (
                        <button
                          type="button"
                          onClick={() => openMessageIA(l)}
                          disabled={messageIALoading && messageIALeadId === l.id}
                          className="btn-ia"
                        >
                          {messageIALoading && messageIALeadId === l.id ? "…" : "Mensaje IA"}
                        </button>
                      )}
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

      <MessageIAPanel
        lead={messageIALead}
        activeChannel={messageIAChannel}
        loading={messageIALoading}
        error={messageIAError}
        callResult={callResult}
        emailResult={emailResult}
        onClose={closeMessageIA}
        onChannelChange={changeMessageIAChannel}
        onRetry={() => messageIALead && void fetchOutreach(messageIALead, messageIAChannel)}
      />
    </div>
  );
}
