"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CompanySuggestion } from "@/lib/apollo-organizations";
import { FieldLabel } from "@/components/ui";
import { useDebounce } from "@/hooks/use-debounce";

type CompanyAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  country: string;
  disabled?: boolean;
};

export function CompanyAutocomplete({
  value,
  onChange,
  country,
  disabled,
}: CompanyAutocompleteProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<CompanySuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debouncedQuery = useDebounce(value, 280);

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) return;

    let cancelled = false;

    void (async () => {
      await Promise.resolve();
      if (cancelled) return;

      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({ q, country });
        const res = await fetch(`/api/prospeccion/companies?${params}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.error) {
          setSuggestions([]);
          setError(data.error);
        } else {
          setSuggestions(data.suggestions ?? []);
          setError("");
        }
      } catch {
        if (!cancelled) setError("No se pudieron cargar sugerencias.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, country]);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function pickSuggestion(item: CompanySuggestion) {
    onChange(item.name);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !suggestions.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      pickSuggestion(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const showList = open && value.trim().length >= 2 && (loading || suggestions.length > 0 || error);

  return (
    <div ref={rootRef} className="company-autocomplete mb-3">
      <FieldLabel htmlFor={`${listId}-input`}>Empresa</FieldLabel>
      <input
        id={`${listId}-input`}
        type="text"
        className="input-field"
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next);
          if (next.trim().length < 2) {
            setSuggestions([]);
            setError("");
            setLoading(false);
          }
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => value.trim().length >= 2 && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Escribe para buscar: Bancolombia, Sura…"
        maxLength={120}
        disabled={disabled}
        role="combobox"
        aria-expanded={Boolean(showList)}
        aria-controls={`${listId}-listbox`}
        aria-autocomplete="list"
        autoComplete="off"
      />
      <p className="text-micro company-autocomplete__hint">
        Sugerencias desde Apollo y tu portafolio (mín. 2 letras).
      </p>

      {showList && (
        <ul
          id={`${listId}-listbox`}
          className="company-autocomplete__list"
          role="listbox"
        >
          {loading && (
            <li className="company-autocomplete__status" role="status">
              Buscando empresas…
            </li>
          )}
          {!loading && error && (
            <li className="company-autocomplete__status company-autocomplete__status--error">
              {error}
            </li>
          )}
          {!loading &&
            !error &&
            suggestions.map((item, index) => (
              <li key={`${item.source}-${item.name}`} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  className={`company-autocomplete__option${
                    index === activeIndex ? " company-autocomplete__option--active" : ""
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickSuggestion(item)}
                >
                  <span className="company-autocomplete__name">{item.name}</span>
                  <span className={`company-autocomplete__tag company-autocomplete__tag--${item.source}`}>
                    {item.source === "apollo" ? "Apollo" : "Portafolio"}
                  </span>
                  {(item.location || item.domain) && (
                    <span className="company-autocomplete__meta">
                      {[item.location, item.domain].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </button>
              </li>
            ))}
          {!loading && !error && !suggestions.length && (
            <li className="company-autocomplete__status">Sin coincidencias en Apollo ni portafolio.</li>
          )}
        </ul>
      )}
    </div>
  );
}
