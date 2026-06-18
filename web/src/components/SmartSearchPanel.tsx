"use client";

import { useEffect, useState } from "react";
import type { SmartSearchResult } from "@/lib/smart-search";
import { FieldLabel } from "@/components/ui";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

type SmartSearchPanelProps = {
  disabled?: boolean;
  onApply: (result: SmartSearchResult) => void | Promise<void>;
};

export function SmartSearchPanel({ disabled, onApply }: SmartSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [iaReady, setIaReady] = useState<boolean | null>(null);
  const [iaModel, setIaModel] = useState("");

  useEffect(() => {
    fetch("/api/prospeccion/smart-search")
      .then((r) => r.json())
      .then((d) => {
        setIaReady(Boolean(d.ok));
        setIaModel(d.model ?? "");
      })
      .catch(() => setIaReady(false));
  }, []);

  const appendTranscript = (text: string) => {
    if (!text) return;
    setQuery((prev) => (prev ? `${prev.trim()} ${text}` : text));
  };

  const { supported, listening, error: micError, toggle } = useSpeechRecognition(appendTranscript);

  async function analyze() {
    const trimmed = query.trim();
    if (trimmed.length < 4) {
      setError("Escribe o dicta al menos 4 caracteres describiendo tu persona objetivo.");
      return;
    }

    setLoading(true);
    setError("");
    setFeedback("");

    try {
      const res = await fetch("/api/prospeccion/smart-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "Error al interpretar la búsqueda");
      }

      setFeedback(data.summary ?? "Filtros aplicados.");
      await onApply(data as SmartSearchResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de búsqueda inteligente");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !loading) void analyze();
    }
  }

  return (
    <div className="smart-search-panel mb-4">
      <div className="smart-search-header">
        <div className="smart-search-header__label">
          <FieldLabel className="!mb-0">Búsqueda inteligente</FieldLabel>
          {iaReady === true && (
            <span className="smart-search-ia-badge" title="Mistral conectado">
              IA · {iaModel || "Mistral"}
            </span>
          )}
          {iaReady === false && (
            <span className="smart-search-ia-badge smart-search-ia-badge--warn">
              Modo básico
            </span>
          )}
        </div>
        {supported && (
          <button
            type="button"
            onClick={toggle}
            disabled={disabled || loading}
            className={`dictate-btn ${listening ? "dictate-btn--active" : ""}`}
            title="Dictar por voz"
          >
            <span className="dictate-btn__dot" aria-hidden />
            {listening ? "Escuchando…" : "Dictar"}
          </button>
        )}
      </div>

      <textarea
        className="input-field smart-search-textarea resize-y"
        placeholder="Describe a quién buscas en lenguaje natural (país, cargo, industria y empresa)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled || loading}
        rows={4}
      />

      <div className="smart-search-actions">
        <button
          type="button"
          onClick={() => void analyze()}
          disabled={disabled || loading}
          className="btn-primary w-full disabled:opacity-60"
        >
          {loading ? "Interpretando con IA…" : "Interpretar y buscar"}
        </button>
        <p className="text-micro smart-search-hint">Enter para buscar · Shift+Enter para nueva línea</p>
      </div>

      {(error || micError) && (
        <p className="text-caption mt-2 text-[#B42318] dark:text-[#F97066]">{error || micError}</p>
      )}
      {feedback && !error && (
        <p className="text-caption mt-2 text-[#0D6E6E] dark:text-[#5EC4C4]">{feedback}</p>
      )}
    </div>
  );
}
