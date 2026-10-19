"use client";

import { useState, type FormEvent } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { PageHeading } from "@/components/HelpTip";
import { ActionBanner, FeedbackAnchor } from "@/components/ui";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { parseApiResponse } from "@/lib/parse-api-response";

type DocumentStats = {
  inputCompanies: number;
  found: number;
  withContacts: number;
  withoutCompleteContact: number;
  missing: number;
  outputRows: number;
  contactsWritten: number;
};

type DocumentResponse = {
  filename: string;
  stats: DocumentStats;
  headers: string[];
  preview: string[][];
  fileBase64: string;
  error?: string;
};

function downloadBase64(filename: string, fileBase64: string) {
  const binary = atob(fileBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function DocumentarPage() {
  const { feedback, showError, showSuccess, clear } = useActionFeedback(0);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DocumentResponse | null>(null);

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      showError("Elige un Excel con la columna de empresa.");
      return;
    }
    setBusy(true);
    clear();
    setResult(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/documentar", { method: "POST", body });
      const { data, error } = await parseApiResponse<DocumentResponse>(response);
      if (error || !data || data.error || !data.fileBase64) {
        showError(error || data?.error || "No se pudo documentar el Excel");
        return;
      }
      setResult(data);
      downloadBase64(data.filename, data.fileBase64);
      showSuccess(
        `${data.stats.withContacts} empresas con contacto, ${data.stats.missing} no están en el portafolio.`,
        "Excel listo"
      );
    } catch {
      showError("No se pudo documentar el Excel");
    } finally {
      setBusy(false);
    }
  }

  const stats = result?.stats;

  return (
    <main className="app-content flex-1 py-6 lg:py-8">
      <header className="page-header">
        <PageHeading
          title="Documentar Excel"
          help="Completa las columnas del archivo con contactos del portafolio. No gasta créditos de Apollo. Una empresa coincide si un nombre contiene al otro. Solo entran contactos con móvil y correo. Si hay varios, cada uno queda en su fila. Si la empresa no está, las columnas pedidas dicen «empresa no existente en el portafolio»."
        />
      </header>

      {feedback && (
        <FeedbackAnchor className="mt-6">
          <ActionBanner
            tone={feedback.tone}
            title={feedback.title}
            message={feedback.message}
            onDismiss={clear}
          />
        </FeedbackAnchor>
      )}

      <form className="settings-panel mt-6" onSubmit={(event) => void generate(event)}>
        <p className="section-label">Archivo</p>
        <h2 className="section-block__title">Empresas a documentar</h2>
        <div className="document-upload">
          <input
            id="excel-file"
            className="document-upload__input"
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setResult(null);
            }}
          />
          <label htmlFor="excel-file" className="btn-secondary">
            {file ? file.name : "Elegir Excel"}
          </label>
          <button type="submit" className="btn-primary" disabled={busy || !file}>
            <FileSpreadsheet size={16} strokeWidth={1.5} aria-hidden />
            {busy ? "Documentando..." : "Generar Excel"}
          </button>
        </div>
      </form>

      {stats && result && (
        <section className="mt-6 space-y-4">
          <div className="kpi-grid kpi-grid--4">
            <article className="kpi-card kpi-card--blue">
              <p className="kpi-card__label">Empresas del archivo</p>
              <p className="kpi-card__value">{stats.inputCompanies.toLocaleString("es-CO")}</p>
            </article>
            <article className="kpi-card kpi-card--teal">
              <p className="kpi-card__label">Con contacto completo</p>
              <p className="kpi-card__value">{stats.withContacts.toLocaleString("es-CO")}</p>
              <p className="kpi-card__sub">{stats.contactsWritten.toLocaleString("es-CO")} filas</p>
            </article>
            <article className="kpi-card kpi-card--amber">
              <p className="kpi-card__label" title="En el portafolio, sin móvil y correo">
                Sin contacto completo
              </p>
              <p className="kpi-card__value">{stats.withoutCompleteContact.toLocaleString("es-CO")}</p>
            </article>
            <article className="kpi-card kpi-card--coral">
              <p className="kpi-card__label">No están en el portafolio</p>
              <p className="kpi-card__value">{stats.missing.toLocaleString("es-CO")}</p>
            </article>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-caption">{result.filename}</p>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => downloadBase64(result.filename, result.fileBase64)}
            >
              <Download size={16} strokeWidth={1.5} aria-hidden />
              Descargar de nuevo
            </button>
          </div>

          <div className="portfolio-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {result.headers.map((header, index) => (
                    <th key={`${header}-${index}`}>{header || "—"}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.preview.map((row, rowIndex) => (
                  <tr key={`${row[0]}-${rowIndex}`}>
                    {result.headers.map((_, cellIndex) => (
                      <td key={`${rowIndex}-${cellIndex}`}>{row[cellIndex] || "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {stats.outputRows > result.preview.length && (
            <p className="text-micro">
              Vista de las primeras {result.preview.length} filas. El archivo trae{" "}
              {stats.outputRows.toLocaleString("es-CO")}.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
