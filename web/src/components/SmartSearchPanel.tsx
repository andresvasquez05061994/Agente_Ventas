"use client";

import { useEffect, useState } from "react";
import type { SmartSearchResult } from "@/lib/smart-search";
import { SectionLabel } from "@/components/ui";
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

  return (
    <div className="smart-search-panel mb-4">
      <SectionLabel>Búsqueda inteligente</SectionLabel>
      <p className="text-caption mb-2">
        Describe en texto o voz a quién buscas. Mistral IA interpreta y aplica país, cargos, industria y
        empresa.
      </p>
      {iaReady === true && (
        <p className="text-micro mb-2 text-[#0D6E6E] dark:text-[#5EC4C4]">
          IA activa · {iaModel || "Mistral"}
        </p>
      )}
      {iaReady === false && (
        <p className="text-micro mb-2 text-[#B54708]">
          Mistral no disponible — se usará modo básico o revisa MISTRAL_API_KEY en Vercel.
        </p>
      )}

      <textarea
        className="input-field mb-2 min-h-[72px] resize-y"
        placeholder='Ej: "Directores de TI en empresas de salud en Bogotá, empresa Sura"'
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={disabled || loading}
        rows={3}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={analyze}
          disabled={disabled || loading}
          className="btn-primary flex-1 disabled:opacity-60"
        >
          {loading ? "Analizando con IA…" : "Analizar y buscar"}
        </button>
        {supported && (
          <button
            type="button"
            onClick={toggle}
            disabled={disabled || loading}
            className={`btn-secondary ${listening ? "ring-2 ring-[#0D6E6E]" : ""}`}
            title="Dictar por voz"
          >
            {listening ? "Escuchando…" : "Voz"}
          </button>
        )}
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
