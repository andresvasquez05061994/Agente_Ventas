"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lead, LeadStatus } from "@/lib/types";
import { EmptyState, SectionLabel } from "@/components/ui";

const STATUSES: LeadStatus[] = ["Nuevo", "En revisión", "Aprobado para contacto", "Descartado"];

export default function PortafolioPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [status, setStatus] = useState("Todos");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const q = new URLSearchParams();
    if (status !== "Todos") q.set("status", status);
    if (search) q.set("search", search);
    const res = await fetch(`/api/leads?${q}`);
    const data = await res.json();
    if (data.error) setMessage(data.error);
    else setLeads(data.leads);
    setLoading(false);
  }, [status, search]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateStatus(id: number, lead_status: LeadStatus) {
    await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_status }),
    });
    load();
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
        <input className="input-field" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre, empresa..." />
      </aside>

      <main className="flex-1 p-6 lg:p-8">
        <h1 className="border-b-2 border-[#003366] pb-2 text-xl font-bold text-[#1A2332] dark:text-[#E8EEF4]">Portafolio</h1>
        {message && <p className="mt-4 text-sm text-red-600">{message}</p>}

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
                  <th className="p-2">Empresa</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-t border-[#E2E6EA] dark:border-[#2A3544]">
                    <td className="p-2 font-medium">{l.nombre}</td>
                    <td className="p-2">{l.empresa ?? "—"}</td>
                    <td className="p-2">{l.email ?? "—"}</td>
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
