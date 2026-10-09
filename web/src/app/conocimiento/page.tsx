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
import type { KnowledgeDocument, KnowledgeProfile } from "@/lib/knowledge-store";

type KnowledgePayload = {
  profile: KnowledgeProfile;
  documents: KnowledgeDocument[];
  meta?: { total: number; active: number };
  error?: string;
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function reload() {
    const res = await fetch("/api/conocimiento");
    const { data, error } = await parseApiResponse<KnowledgePayload>(res);
    if (error || data?.error) throw new Error(error ?? data?.error ?? "No se pudo cargar");
    setProfile(data?.profile ?? EMPTY_PROFILE);
    setDocuments(data?.documents ?? []);
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

  const activeCount = documents.filter((doc) => doc.active).length;
  const busy = loading || saving || uploading;

  return (
    <main className="app-content flex-1 py-6 lg:py-8">
      <header className="page-header">
        <div>
          <PageTitle>Conocimiento</PageTitle>
          <PageSubtitle>
            Portafolio y documentos que alimentan el Mensaje IA según el cargo, la investigación y los
            intereses de cada cliente.
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
