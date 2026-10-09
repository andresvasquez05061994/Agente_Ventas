"use client";

import { useEffect, useId, useState } from "react";
import { FileSpreadsheet, FileText, Trash2, Upload } from "lucide-react";
import {
  ActionBanner,
  FeedbackAnchor,
  FieldLabel,
  PageSubtitle,
  PageTitle,
} from "@/components/ui";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { parseApiResponse } from "@/lib/parse-api-response";
import type { BuyerPersona, KnowledgeDocument, KnowledgeProfile } from "@/lib/knowledge-store";

type KnowledgePayload = {
  profile: KnowledgeProfile;
  documents: KnowledgeDocument[];
  personas: BuyerPersona[];
  meta?: { total: number; active: number; personas?: number };
  error?: string;
};

type PersonaDraft = {
  name: string;
  role: string;
  sector: string;
  characteristics: string;
  value_for_client: string;
};

const EMPTY_DRAFT: PersonaDraft = {
  name: "",
  role: "",
  sector: "",
  characteristics: "",
  value_for_client: "",
};

const EMPTY_PROFILE: KnowledgeProfile = {
  name: "",
  tagline: "",
  experience: "",
  scale: "",
  sectors: "",
  consultant: "",
  consultant_role: "",
  email: "",
  phone: "",
  web: "",
  notes: "",
  updated_at: null,
};

function kindLabel(kind: string): string {
  if (kind === "pdf") return "PDF";
  if (kind === "docx") return "Word";
  if (kind === "xlsx") return "Excel";
  return "Texto";
}

export default function ConocimientoPage() {
  const inputId = useId();
  const { feedback, showError, showSuccess, showInfo, clear } = useActionFeedback();
  const [profile, setProfile] = useState<KnowledgeProfile>(EMPTY_PROFILE);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [personas, setPersonas] = useState<BuyerPersona[]>([]);
  const [edits, setEdits] = useState<Record<number, PersonaDraft>>({});
  const [draft, setDraft] = useState<PersonaDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [personaBusy, setPersonaBusy] = useState<number | "new" | null>(null);

  async function reload() {
    const res = await fetch("/api/conocimiento");
    const { data, error } = await parseApiResponse<KnowledgePayload>(res);
    if (error || data?.error) throw new Error(error ?? data?.error ?? "No se pudo cargar");
    setProfile(data?.profile ?? EMPTY_PROFILE);
    setDocuments(data?.documents ?? []);
    setPersonas(data?.personas ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/conocimiento")
      .then((res) => parseApiResponse<KnowledgePayload>(res))
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || data?.error) throw new Error(error ?? data?.error ?? "No se pudo cargar");
        setProfile(data?.profile ?? EMPTY_PROFILE);
        setDocuments(data?.documents ?? []);
        setPersonas(data?.personas ?? []);
      })
      .catch((e) => {
        if (!cancelled) {
          showError(e instanceof Error ? e.message : "Error al cargar conocimiento", "Conocimiento");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga inicial
  }, []);

  function patchProfile<K extends keyof KnowledgeProfile>(key: K, value: KnowledgeProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function saveProfile() {
    setSaving(true);
    clear();
    try {
      const res = await fetch("/api/conocimiento/perfil", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const { data, error } = await parseApiResponse<{ profile?: KnowledgeProfile; error?: string }>(res);
      if (error || data?.error) throw new Error(error ?? data?.error);
      if (data?.profile) setProfile(data.profile);
      showSuccess("El Mensaje IA usará este perfil en la firma y el contexto comercial.", "Perfil guardado");
    } catch (e) {
      showError(e instanceof Error ? e.message : "No se pudo guardar", "Perfil");
    } finally {
      setSaving(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    clear();
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/conocimiento/documentos", { method: "POST", body: form });
      const { data, error } = await parseApiResponse<{ document?: KnowledgeDocument; error?: string }>(res);
      if (error || data?.error) throw new Error(error ?? data?.error);
      await reload();
      const services = data?.document?.services_count ?? 0;
      showSuccess(
        services
          ? `Se extrajo el texto y ${services} servicio(s) para el Mensaje IA.`
          : "Se extrajo el texto. El Mensaje IA usará los fragmentos más relevantes según cargo, sector e investigación del cliente.",
        "Documento cargado"
      );
    } catch (e) {
      showError(e instanceof Error ? e.message : "No se pudo leer el archivo", "Documento");
    } finally {
      setUploading(false);
    }
  }

  async function toggleDoc(doc: KnowledgeDocument) {
    try {
      const res = await fetch(`/api/conocimiento/documentos/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !doc.active }),
      });
      const { data, error } = await parseApiResponse<{ document?: KnowledgeDocument; error?: string }>(res);
      if (error || data?.error) throw new Error(error ?? data?.error);
      setDocuments((list) => list.map((item) => (item.id === doc.id ? { ...item, active: !item.active } : item)));
      showInfo(doc.active ? "Dejó de usarse en Mensaje IA." : "Volvió a estar disponible para Mensaje IA.", doc.filename);
    } catch (e) {
      showError(e instanceof Error ? e.message : "No se pudo actualizar", "Documento");
    }
  }

  async function removeDoc(doc: KnowledgeDocument) {
    if (!window.confirm(`¿Eliminar «${doc.filename}» del conocimiento?`)) return;
    try {
      const res = await fetch(`/api/conocimiento/documentos/${doc.id}`, { method: "DELETE" });
      const { error } = await parseApiResponse<{ error?: string }>(res);
      if (error) throw new Error(error);
      setDocuments((list) => list.filter((item) => item.id !== doc.id));
      showSuccess("Ya no se usará en los mensajes.", "Documento eliminado");
    } catch (e) {
      showError(e instanceof Error ? e.message : "No se pudo eliminar", "Documento");
    }
  }

  function personaFields(persona: BuyerPersona): PersonaDraft {
    return edits[persona.id] ?? {
      name: persona.name,
      role: persona.role,
      sector: persona.sector,
      characteristics: persona.characteristics,
      value_for_client: persona.value_for_client,
    };
  }

  function patchEdit(id: number, key: keyof PersonaDraft, value: string) {
    setEdits((current) => {
      const persona = personas.find((item) => item.id === id);
      const base = current[id] ?? {
        name: persona?.name ?? "",
        role: persona?.role ?? "",
        sector: persona?.sector ?? "",
        characteristics: persona?.characteristics ?? "",
        value_for_client: persona?.value_for_client ?? "",
      };
      return { ...current, [id]: { ...base, [key]: value } };
    });
  }

  async function savePersona(id: number) {
    const fields = personaFields(personas.find((item) => item.id === id)!);
    setPersonaBusy(id);
    clear();
    try {
      const res = await fetch(`/api/conocimiento/personas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const { data, error } = await parseApiResponse<{ persona?: BuyerPersona; error?: string }>(res);
      if (error || data?.error || !data?.persona) throw new Error(error ?? data?.error);
      setPersonas((list) => list.map((item) => (item.id === id ? data.persona! : item)));
      setEdits((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      showSuccess("El Mensaje IA usará este buyer persona cuando el contacto coincida.", "Buyer persona guardado");
    } catch (e) {
      showError(e instanceof Error ? e.message : "No se pudo guardar", "Buyer persona");
    } finally {
      setPersonaBusy(null);
    }
  }

  async function createPersona() {
    setPersonaBusy("new");
    clear();
    try {
      const res = await fetch("/api/conocimiento/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const { data, error } = await parseApiResponse<{ persona?: BuyerPersona; error?: string }>(res);
      if (error || data?.error || !data?.persona) throw new Error(error ?? data?.error);
      setPersonas((list) => [data.persona!, ...list]);
      setDraft(EMPTY_DRAFT);
      showSuccess("Quedó en el listado. El Mensaje IA lo usará según cargo, sector y características.", "Buyer persona creado");
    } catch (e) {
      showError(e instanceof Error ? e.message : "No se pudo crear", "Buyer persona");
    } finally {
      setPersonaBusy(null);
    }
  }

  async function removePersona(persona: BuyerPersona) {
    if (!window.confirm(`¿Eliminar el buyer persona «${persona.name}»?`)) return;
    setPersonaBusy(persona.id);
    try {
      const res = await fetch(`/api/conocimiento/personas/${persona.id}`, { method: "DELETE" });
      const { error } = await parseApiResponse<{ error?: string }>(res);
      if (error) throw new Error(error);
      setPersonas((list) => list.filter((item) => item.id !== persona.id));
      showSuccess("Ya no se usará en los mensajes.", "Buyer persona eliminado");
    } catch (e) {
      showError(e instanceof Error ? e.message : "No se pudo eliminar", "Buyer persona");
    } finally {
      setPersonaBusy(null);
    }
  }

  const activeCount = documents.filter((doc) => doc.active).length;
  const busy = loading || saving || uploading || personaBusy !== null;

  return (
    <main className="app-content flex-1 py-6 lg:py-8">
      <header className="page-header">
        <div>
          <PageTitle>Conocimiento</PageTitle>
          <PageSubtitle>
            Perfil comercial, buyer personas y documentos que alimentan el Mensaje IA según el cargo,
            la investigación y lo que genera valor para cada cliente.
          </PageSubtitle>
        </div>
      </header>

      {feedback && (
        <FeedbackAnchor>
          <ActionBanner {...feedback} onDismiss={clear} />
        </FeedbackAnchor>
      )}

      {loading ? (
        <div className="mt-6 space-y-3">
          <div className="kpi-skeleton h-40" />
          <div className="kpi-skeleton h-40" />
        </div>
      ) : (
        <div className="knowledge-layout">
          <section className="knowledge-card">
            <p className="knowledge-card__title">Perfil comercial</p>
            <p className="text-micro mb-3">Firma, promesa y sectores. Se usa en cada mensaje.</p>
            <div className="knowledge-grid">
              <div>
                <FieldLabel>Empresa</FieldLabel>
                <input className="input-field" value={profile.name} onChange={(e) => patchProfile("name", e.target.value)} />
              </div>
              <div>
                <FieldLabel>Promesa / tagline</FieldLabel>
                <input className="input-field" value={profile.tagline} onChange={(e) => patchProfile("tagline", e.target.value)} />
              </div>
              <div>
                <FieldLabel>Consultor</FieldLabel>
                <input className="input-field" value={profile.consultant} onChange={(e) => patchProfile("consultant", e.target.value)} />
              </div>
              <div>
                <FieldLabel>Cargo del consultor</FieldLabel>
                <input className="input-field" value={profile.consultant_role} onChange={(e) => patchProfile("consultant_role", e.target.value)} />
              </div>
              <div>
                <FieldLabel>Email</FieldLabel>
                <input className="input-field" value={profile.email} onChange={(e) => patchProfile("email", e.target.value)} />
              </div>
              <div>
                <FieldLabel>Teléfono</FieldLabel>
                <input className="input-field" value={profile.phone} onChange={(e) => patchProfile("phone", e.target.value)} />
              </div>
              <div>
                <FieldLabel>Web</FieldLabel>
                <input className="input-field" value={profile.web} onChange={(e) => patchProfile("web", e.target.value)} />
              </div>
              <div>
                <FieldLabel>Escala / trayectoria</FieldLabel>
                <input className="input-field" value={profile.scale} onChange={(e) => patchProfile("scale", e.target.value)} />
              </div>
            </div>
            <FieldLabel className="!mt-3">Experiencia</FieldLabel>
            <input className="input-field" value={profile.experience} onChange={(e) => patchProfile("experience", e.target.value)} />
            <FieldLabel className="!mt-3">Sectores</FieldLabel>
            <input
              className="input-field"
              value={profile.sectors}
              onChange={(e) => patchProfile("sectors", e.target.value)}
              placeholder="Manufactura, construcción, retail…"
            />
            <FieldLabel className="!mt-3">Notas para la IA</FieldLabel>
            <textarea
              className="input-field knowledge-notes"
              rows={3}
              value={profile.notes}
              onChange={(e) => patchProfile("notes", e.target.value)}
              placeholder="Enfoque comercial, ofertas vigentes, lo que no se debe ofrecer…"
            />
            <button type="button" className="btn-primary mt-3" onClick={() => void saveProfile()} disabled={busy}>
              {saving ? "Guardando…" : "Guardar perfil"}
            </button>
          </section>

          <section className="knowledge-card">
            <p className="knowledge-card__title">Buyer personas</p>
            <p className="text-micro mb-3">
              Fichas editables. El Mensaje IA elige la que coincida con el cargo, el sector y las
              características del contacto.
            </p>

            <div className="persona-card persona-card--new">
              <p className="persona-card__label">Nuevo buyer persona</p>
              <FieldLabel>Nombre</FieldLabel>
              <input
                className="input-field"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Ej. Director de operaciones en manufactura"
              />
              <div className="knowledge-grid mt-2">
                <div>
                  <FieldLabel>Cargo / rol</FieldLabel>
                  <input
                    className="input-field"
                    value={draft.role}
                    onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
                    placeholder="COO, Gerente de planta…"
                  />
                </div>
                <div>
                  <FieldLabel>Sector</FieldLabel>
                  <input
                    className="input-field"
                    value={draft.sector}
                    onChange={(e) => setDraft((d) => ({ ...d, sector: e.target.value }))}
                    placeholder="Manufactura, retail…"
                  />
                </div>
              </div>
              <FieldLabel className="!mt-2">Características del cliente</FieldLabel>
              <textarea
                className="input-field knowledge-notes"
                rows={2}
                value={draft.characteristics}
                onChange={(e) => setDraft((d) => ({ ...d, characteristics: e.target.value }))}
                placeholder="Dolores, prioridades, cómo decide, contexto típico…"
              />
              <FieldLabel className="!mt-2">¿Qué genera valor para este cliente?</FieldLabel>
              <textarea
                className="input-field knowledge-notes"
                rows={2}
                value={draft.value_for_client}
                onChange={(e) => setDraft((d) => ({ ...d, value_for_client: e.target.value }))}
                placeholder="El beneficio concreto que debe articular el Mensaje IA…"
              />
              <button
                type="button"
                className="btn-primary mt-3 w-full"
                onClick={() => void createPersona()}
                disabled={busy || !draft.name.trim()}
              >
                {personaBusy === "new" ? "Guardando…" : "Agregar buyer persona"}
              </button>
            </div>

            {personas.length === 0 ? (
              <p className="text-micro mt-3">Aún no hay fichas. Agrega la primera para personalizar los mensajes.</p>
            ) : (
              <ul className="persona-list">
                {personas.map((persona) => {
                  const fields = personaFields(persona);
                  return (
                    <li key={persona.id} className="persona-card">
                      <FieldLabel>Nombre</FieldLabel>
                      <input
                        className="input-field"
                        value={fields.name}
                        onChange={(e) => patchEdit(persona.id, "name", e.target.value)}
                      />
                      <div className="knowledge-grid mt-2">
                        <div>
                          <FieldLabel>Cargo / rol</FieldLabel>
                          <input
                            className="input-field"
                            value={fields.role}
                            onChange={(e) => patchEdit(persona.id, "role", e.target.value)}
                          />
                        </div>
                        <div>
                          <FieldLabel>Sector</FieldLabel>
                          <input
                            className="input-field"
                            value={fields.sector}
                            onChange={(e) => patchEdit(persona.id, "sector", e.target.value)}
                          />
                        </div>
                      </div>
                      <FieldLabel className="!mt-2">Características del cliente</FieldLabel>
                      <textarea
                        className="input-field knowledge-notes"
                        rows={2}
                        value={fields.characteristics}
                        onChange={(e) => patchEdit(persona.id, "characteristics", e.target.value)}
                      />
                      <FieldLabel className="!mt-2">¿Qué genera valor para este cliente?</FieldLabel>
                      <textarea
                        className="input-field knowledge-notes"
                        rows={2}
                        value={fields.value_for_client}
                        onChange={(e) => patchEdit(persona.id, "value_for_client", e.target.value)}
                      />
                      <div className="persona-card__actions">
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => void savePersona(persona.id)}
                          disabled={busy}
                        >
                          {personaBusy === persona.id ? "Guardando…" : "Guardar"}
                        </button>
                        <button
                          type="button"
                          className="knowledge-doc__delete"
                          onClick={() => void removePersona(persona)}
                          disabled={busy}
                          aria-label={`Eliminar ${persona.name}`}
                        >
                          <Trash2 size={14} strokeWidth={1.75} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="knowledge-card knowledge-card--docs">
            <p className="knowledge-card__title">Documentos del portafolio</p>
            <p className="text-micro mb-3">
              {activeCount} activo{activeCount === 1 ? "" : "s"} de {documents.length}. PDF, Word o Excel. Máx. 4 MB.
            </p>
            <label
              htmlFor={inputId}
              className={`knowledge-drop ${busy ? "pointer-events-none opacity-50" : ""}`}
            >
              <Upload size={16} strokeWidth={1.5} aria-hidden />
              {uploading ? "Leyendo y estructurando…" : "Cargar PDF, Word o Excel"}
            </label>
            <input
              id={inputId}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void onFile(file);
              }}
            />

            {documents.length === 0 ? (
              <p className="text-micro mt-4">
                Sin documentos. Hasta que cargues uno, el Mensaje IA usa el portafolio IAC por defecto.
              </p>
            ) : (
              <ul className="knowledge-docs">
                {documents.map((doc) => (
                  <li key={doc.id} className={`knowledge-doc ${doc.active ? "" : "knowledge-doc--off"}`}>
                    <div className="knowledge-doc__icon" aria-hidden>
                      {doc.kind === "xlsx" ? <FileSpreadsheet size={16} /> : <FileText size={16} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="knowledge-doc__name" title={doc.filename}>
                        {doc.filename}
                      </p>
                      <p className="text-micro">
                        {kindLabel(doc.kind)}
                        {doc.services_count ? ` · ${doc.services_count} servicio(s)` : ""}
                        {` · ${Math.round(doc.char_count / 1000) || 1} mil caracteres`}
                        {doc.active ? " · En uso" : " · Pausado"}
                      </p>
                      {doc.summary && <p className="knowledge-doc__summary">{doc.summary}</p>}
                    </div>
                    <div className="knowledge-doc__actions">
                      <button type="button" className="btn-secondary" onClick={() => void toggleDoc(doc)} disabled={busy}>
                        {doc.active ? "Pausar" : "Activar"}
                      </button>
                      <button
                        type="button"
                        className="knowledge-doc__delete"
                        onClick={() => void removeDoc(doc)}
                        disabled={busy}
                        aria-label={`Eliminar ${doc.filename}`}
                      >
                        <Trash2 size={14} strokeWidth={1.75} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
