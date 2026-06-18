"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConversationStats,
  ConversationThread,
  Lead,
  WhatsAppMessage,
} from "@/lib/types";
import {
  INBOX_FILTERS,
  type InboxFilter,
  formatMessageTime,
  statusBadgeClass,
  truncatePreview,
} from "@/lib/whatsapp";
import { useConversationPoll } from "@/hooks/use-conversation-poll";
import { useDebounce } from "@/hooks/use-debounce";
import { KpiCard, KpiGrid } from "@/components/ui";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#0D6E6E] dark:text-[#5EC4C4]">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0D6E6E] opacity-40" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#0D6E6E]" />
      </span>
      En vivo
    </span>
  );
}

export function ConversationConsole() {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [stats, setStats] = useState<ConversationStats | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [listError, setListError] = useState("");
  const [threadError, setThreadError] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadInbox = useCallback(
    async (overrideFilter?: InboxFilter) => {
      const activeFilter = overrideFilter ?? filter;
      const q = new URLSearchParams({ filter: activeFilter });
      const term = debouncedSearch.trim();
      if (term) q.set("search", term);
      try {
        const res = await fetch(`/api/conversations?${q}`);
        const data = await res.json();
        if (data.error) {
          setListError(data.error);
          return;
        }
        setListError("");
        setThreads(data.threads ?? []);
        setStats(data.stats ?? null);
      } catch {
        setListError("No se pudo cargar la bandeja de conversaciones.");
      } finally {
        setListLoading(false);
      }
    },
    [filter, debouncedSearch]
  );

  const fetchThread = useCallback(async (leadId: number) => {
    try {
      const res = await fetch(`/api/conversations/${leadId}`);
      const data = await res.json();
      if (data.error) {
        setThreadError(data.error);
        return;
      }
      setThreadError("");
      setLead(data.lead);
      setMessages(data.messages ?? []);
    } catch {
      setThreadError("No se pudo cargar el hilo.");
    }
  }, []);

  useConversationPoll(loadInbox, true);

  useConversationPoll(
    () => (selectedId ? fetchThread(selectedId) : Promise.resolve()),
    Boolean(selectedId)
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const showListLoading = listLoading || search !== debouncedSearch;

  function selectThread(id: number) {
    setSelectedId(id);
    setThreadError("");
    void fetchThread(id);
  }

  function changeFilter(value: InboxFilter) {
    setListLoading(true);
    setFilter(value);
    void loadInbox(value);
  }

  const selectedThread = threads.find((t) => t.id === selectedId);

  return (
    <div className="conv-console">
      <div className="conv-console__header">
        <div>
          <h1 className="page-title">Conversaciones</h1>
          <p className="text-caption mt-1">
            Centro de control WhatsApp — bandeja unificada con actualización automática cada 4 s.
          </p>
        </div>
        <LiveDot />
      </div>

      {stats && (
        <KpiGrid className="conv-console__kpis">
          <KpiCard label="Conversaciones" value={stats.total_threads} accent="blue" />
          <KpiCard label="Activas" value={stats.active} accent="teal" tag={{ positive: true, label: "En curso" }} />
          <KpiCard label="Pendientes" value={stats.pending} accent="gray" />
          <KpiCard label="Agendadas" value={stats.scheduled} accent="teal" tag={{ positive: true, label: "Interés" }} />
          <KpiCard
            label="Esperando respuesta"
            value={stats.awaiting_reply}
            accent="coral"
            tag={{ positive: false, label: "Seguimiento" }}
          />
          <KpiCard label="Errores" value={stats.errors} accent="coral" />
        </KpiGrid>
      )}

      <div className="conv-console__panels">
        {/* Inbox */}
        <aside className="conv-inbox">
          <div className="conv-inbox__toolbar">
            <input
              className="input-field"
              placeholder="Buscar contacto, empresa o teléfono…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="conv-inbox__filters">
              {INBOX_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => changeFilter(f.value)}
                  className={`conv-filter-chip ${filter === f.value ? "conv-filter-chip--active" : ""}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {listError && <p className="conv-error">{listError}</p>}

          <div className="conv-inbox__list">
            {showListLoading && threads.length === 0 ? (
              <p className="text-caption p-4">Cargando bandeja…</p>
            ) : threads.length === 0 ? (
              <div className="conv-empty-inbox">
                <WhatsAppIcon className="h-10 w-10 text-[#25D366] opacity-60" />
                <p className="text-body-strong mt-3">Sin conversaciones aún</p>
                <p className="text-caption mt-1 px-4 text-center">
                  Aparecerán aquí cuando el agente envíe o reciba mensajes por WhatsApp. Aprueba
                  leads en Portafolio para iniciar el contacto.
                </p>
              </div>
            ) : (
              threads.map((t) => {
                const active = selectedId === t.id;
                const isAwaiting =
                  t.last_direction === "outbound" &&
                  (t.whatsapp_status === "Enviado" || t.whatsapp_status === "En conversación");
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectThread(t.id)}
                    className={`conv-inbox-item ${active ? "conv-inbox-item--active" : ""}`}
                  >
                    <div className="conv-inbox-item__avatar">
                      <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />
                    </div>
                    <div className="conv-inbox-item__body">
                      <div className="conv-inbox-item__top">
                        <span className="conv-inbox-item__name">{t.nombre}</span>
                        <span className="conv-inbox-item__time">
                          {formatMessageTime(t.last_message_at)}
                        </span>
                      </div>
                      <div className="conv-inbox-item__meta">
                        {t.empresa ?? "—"}
                        {isAwaiting && <span className="conv-awaiting-dot" title="Esperando respuesta" />}
                      </div>
                      <p className="conv-inbox-item__preview">
                        {t.last_direction === "outbound" && (
                          <span className="text-[#8A97A8]">Tú: </span>
                        )}
                        {truncatePreview(t.last_message)}
                      </p>
                      <span className={statusBadgeClass(t.whatsapp_status)}>
                        {t.whatsapp_status}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Thread */}
        <section className="conv-thread">
          {!selectedId ? (
            <div className="conv-thread__placeholder">
              <WhatsAppIcon className="h-12 w-12 text-[#25D366] opacity-40" />
              <p className="text-body-strong mt-4">Selecciona una conversación</p>
              <p className="text-caption mt-1 max-w-sm text-center">
                El hilo de mensajes y el contexto del lead aparecerán aquí, como en un panel de
                Service Cloud.
              </p>
            </div>
          ) : (
            <>
              <header className="conv-thread__header">
                <div>
                  <h2 className="conv-thread__title">{selectedThread?.nombre ?? lead?.nombre}</h2>
                  <p className="text-caption">
                    {[selectedThread?.cargo, selectedThread?.empresa].filter(Boolean).join(" · ") ||
                      "—"}
                  </p>
                </div>
                {selectedThread && (
                  <span className={statusBadgeClass(selectedThread.whatsapp_status)}>
                    {selectedThread.whatsapp_status}
                  </span>
                )}
              </header>

              {threadError && <p className="conv-error px-4">{threadError}</p>}

              <div className="conv-thread__messages">
                {messages.length === 0 ? (
                  <p className="text-caption text-center py-8">
                    Sin mensajes en este hilo. El agente aún no ha contactado a este lead.
                  </p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`conv-bubble-row ${m.direction === "outbound" ? "conv-bubble-row--out" : "conv-bubble-row--in"}`}
                    >
                      <div
                        className={`conv-bubble ${m.direction === "outbound" ? "conv-bubble--out" : "conv-bubble--in"}`}
                      >
                        <p className="conv-bubble__text">{m.content}</p>
                        <time className="conv-bubble__time">
                          {new Date(m.created_at).toLocaleString("es-CO", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {m.direction === "outbound" ? " · Agente" : " · Lead"}
                        </time>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <footer className="conv-thread__footer">
                <p className="text-micro">
                  La respuesta automática del agente Mistral se activará al conectar la API de
                  WhatsApp (Meta / Twilio). Los mensajes entrantes ya se registran vía webhook.
                </p>
              </footer>
            </>
          )}
        </section>

        {/* Lead sidebar */}
        <aside className="conv-sidebar">
          {lead ? (
            <>
              <p className="section-label">Detalle del contacto</p>
              <dl className="conv-detail-list">
                <div>
                  <dt>Nombre</dt>
                  <dd>{lead.nombre}</dd>
                </div>
                <div>
                  <dt>Empresa</dt>
                  <dd>{lead.empresa ?? "—"}</dd>
                </div>
                <div>
                  <dt>Cargo</dt>
                  <dd>{lead.cargo ?? "—"}</dd>
                </div>
                <div>
                  <dt>Teléfono</dt>
                  <dd>
                    {lead.telefono ? (
                      <a href={`tel:${lead.telefono}`}>{lead.telefono}</a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>
                    {lead.email ? (
                      <a href={`mailto:${lead.email}`}>{lead.email}</a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Estado lead</dt>
                  <dd>{lead.lead_status}</dd>
                </div>
                <div>
                  <dt>WhatsApp</dt>
                  <dd>
                    <span className={statusBadgeClass(lead.whatsapp_status)}>
                      {lead.whatsapp_status}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Mensajes</dt>
                  <dd>{messages.length}</dd>
                </div>
                {lead.notas && (
                  <div>
                    <dt>Notas</dt>
                    <dd className="whitespace-pre-wrap">{lead.notas}</dd>
                  </div>
                )}
              </dl>
            </>
          ) : (
            <div className="conv-sidebar__empty">
              <p className="text-caption">Contexto del lead seleccionado</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
