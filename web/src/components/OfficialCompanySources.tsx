"use client";

import { useEffect, useId, useState } from "react";
import { FileUp, Trash2 } from "lucide-react";
import { ActionBanner } from "@/components/ui";
import { parseApiResponse } from "@/lib/parse-api-response";
import { DECLARED_COMPANY_SOURCES } from "@/lib/company-source-types";
import {
  type OfficialCompanySource,
} from "@/lib/official-company-data";

type SourcesResponse = {
  sources?: OfficialCompanySource[];
  source?: OfficialCompanySource;
  imported?: number;
  error?: string;
};

export function OfficialCompanySources() {
  const inputId = useId();
  const [sources, setSources] = useState<OfficialCompanySource[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [declaredSource, setDeclaredSource] = useState<(typeof DECLARED_COMPANY_SOURCES)[number]>("Supersociedades");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);

  async function reload() {
    const response = await fetch("/api/enriquecimiento/empresas", { cache: "no-store" });
    const { data, error } = await parseApiResponse<SourcesResponse>(response);
    if (error || data?.error) throw new Error(error ?? data?.error ?? "No se pudieron cargar las bases.");
    setSources(data?.sources ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/enriquecimiento/empresas", { cache: "no-store" })
      .then((response) => parseApiResponse<SourcesResponse>(response))
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || data?.error) {
          setMessage({
            tone: "error",
            text: error ?? data?.error ?? "No se pudieron cargar las bases.",
          });
          return;
        }
        setSources(data?.sources ?? []);
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage({
            tone: "error",
            text: error instanceof Error ? error.message : "No se pudieron cargar las bases.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function upload() {
    if (!file) {
      setMessage({ tone: "error", text: "Elige un Excel o CSV de empresas." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("declared_source", declaredSource);
      const response = await fetch("/api/enriquecimiento/empresas", { method: "POST", body: form });
      const { data, error } = await parseApiResponse<SourcesResponse>(response);
      if (error || data?.error) throw new Error(error ?? data?.error ?? "No se pudo importar el archivo.");
      setFile(null);
      await reload();
      setMessage({ tone: "success", text: `${data?.imported ?? 0} empresa(s) importadas. El motor solo considerará las que tengan 50 o más empleados.` });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "No se pudo importar el archivo." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(source: OfficialCompanySource) {
    if (!window.confirm(`¿Eliminar la base «${source.filename}» y sus empresas?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/enriquecimiento/empresas?id=${source.id}`, { method: "DELETE" });
      const { error } = await parseApiResponse<{ error?: string }>(response);
      if (error) throw new Error(error);
      await reload();
      setMessage({ tone: "success", text: "Base eliminada." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "No se pudo eliminar la base." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="enrichment-source-card">
      <div>
        <p className="section-label">Base de empresas</p>
        <h2 className="section-block__title">Importar una fuente de empresas</h2>
        <p className="text-caption">Carga un Excel o CSV exportado de Supersociedades, RUES, una cámara de comercio u otra fuente declarada. La plataforma conserva el origen informado y no lo valida por sí sola.</p>
      </div>
      {message ? <ActionBanner compact tone={message.tone} message={message.text} onDismiss={() => setMessage(null)} /> : null}
      <div className="enrichment-source-card__form">
        <select className="input-field" value={declaredSource} onChange={(event) => setDeclaredSource(event.target.value as typeof declaredSource)} disabled={busy} aria-label="Origen declarado de la base">
          {DECLARED_COMPANY_SOURCES.map((source) => <option key={source}>{source}</option>)}
        </select>
        <input
          id={inputId}
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="hidden"
          disabled={busy}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <label htmlFor={inputId} className="btn-secondary">{file?.name ?? "Elegir Excel o CSV"}</label>
        <button type="button" className="btn-primary" onClick={() => void upload()} disabled={busy || !file}>
          <FileUp size={15} strokeWidth={1.5} aria-hidden />
          {busy ? "Importando…" : "Importar"}
        </button>
      </div>
      {sources.length > 0 ? (
        <ul className="enrichment-source-card__list">
          {sources.map((source) => (
            <li key={source.id}>
              <div>
                <p className="text-body-strong">{source.filename}</p>
                <p className="text-micro">{source.declared_source} · {source.row_count.toLocaleString("es-CO")} empresas</p>
              </div>
              <button type="button" className="knowledge-doc__delete" onClick={() => void remove(source)} disabled={busy} aria-label={`Eliminar ${source.filename}`}>
                <Trash2 size={14} strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
