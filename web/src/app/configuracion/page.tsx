"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ActionBanner, FeedbackAnchor, FieldLabel, PageSubtitle, PageTitle } from "@/components/ui";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { DEFAULT_APOLLO_MONTHLY_BUDGET } from "@/lib/credit-policy";
import { parseApiResponse } from "@/lib/parse-api-response";

type BudgetSource = "guardado" | "predeterminado";

type ApolloBudget = {
  credits_this_month: number;
  searches_this_month: number;
  monthly_budget: number;
  remaining: number;
  used_percent: number;
  budget_source: BudgetSource;
};

const RESET_LABEL = DEFAULT_APOLLO_MONTHLY_BUDGET.toLocaleString("es-CO");

const SOURCE_HINT: Record<BudgetSource, string> = {
  guardado: `Ajuste solo de este mes. El día 1 (00:00 UTC, 7:00 p. m. de Colombia del día anterior) vuelve a ${RESET_LABEL}.`,
  predeterminado: `Tope de este mes: ${RESET_LABEL}. Si lo cambias, el ajuste dura hasta el cierre del mes.`,
};

function formatCredits(n: number) {
  return n.toLocaleString("es-CO");
}

function meterTone(percent: number, remaining: number) {
  if (remaining <= 0 || percent >= 100) return "credit-meter__fill--full";
  if (percent >= 85) return "credit-meter__fill--warn";
  return "";
}

export default function ConfiguracionPage() {
  const { feedback, showError, showSuccess, showWarning, clear } = useActionFeedback();
  const [budget, setBudget] = useState<ApolloBudget | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/apollo-budget")
      .then((res) => parseApiResponse<ApolloBudget & { error?: string }>(res))
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data || data.error) {
          showError(error || data?.error || "No se pudo cargar el tope de Apollo");
          return;
        }
        setBudget(data);
        setDraft(String(data.monthly_budget));
      })
      .catch(() => {
        if (!cancelled) showError("No se pudo cargar el tope de Apollo");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showError]);

  async function save(event: FormEvent) {
    event.preventDefault();
    const next = Number(draft);
    if (!Number.isInteger(next) || next < 1 || next > 1_000_000) {
      showWarning("Escribe un entero entre 1 y 1.000.000.");
      return;
    }
    setSaving(true);
    clear();
    try {
      const res = await fetch("/api/settings/apollo-budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budget: next }),
      });
      const { data, error } = await parseApiResponse<ApolloBudget & { error?: string }>(res);
      if (error || !data || data.error) {
        showError(error || data?.error || "No se pudo guardar el tope");
        return;
      }
      setBudget(data);
      setDraft(String(data.monthly_budget));
      window.dispatchEvent(new Event("apollo-budget-changed"));
      if (data.remaining <= 0) {
        showWarning(
          `Tope guardado en ${formatCredits(data.monthly_budget)}. Este mes ya se usaron ${formatCredits(data.credits_this_month)}, así que la prospección sigue bloqueada hasta que subas el número o empiece el mes.`,
          "Tope por debajo del consumo"
        );
      } else {
        showSuccess(
          `La siguiente búsqueda ya usa ${formatCredits(data.monthly_budget)} créditos. El mes siguiente vuelve a ${RESET_LABEL}.`,
          "Tope de este mes actualizado"
        );
      }
    } catch {
      showError("No se pudo guardar el tope");
    } finally {
      setSaving(false);
    }
  }

  const used = budget?.credits_this_month ?? 0;
  const cap = budget?.monthly_budget ?? 0;
  const percent = budget?.used_percent ?? 0;
  const remaining = budget?.remaining ?? 0;
  const barWidth = Math.min(100, Math.max(0, percent));
  const unchanged = budget != null && draft.trim() === String(budget.monthly_budget);

  return (
    <main className="app-content flex-1 py-6 lg:py-8">
      <header className="page-header">
        <PageTitle>Configuración</PageTitle>
        <PageSubtitle>
          Tope mensual de créditos Apollo de tu cuenta. El cambio aplica en la siguiente búsqueda y no afecta a los demás usuarios.
        </PageSubtitle>
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

      {loading && !budget && (
        <div className="settings-panel mt-6">
          <div className="kpi-skeleton h-28" />
        </div>
      )}

      {budget && (
        <div className="settings-panel mt-6">
          <p className="section-label">Apollo</p>
          <h2 className="section-block__title">Uso del mes</h2>
          <p className="section-block__desc">{SOURCE_HINT[budget.budget_source]}</p>

          <div
            className="credit-meter"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={barWidth}
            aria-label={`${percent}% del tope mensual de Apollo usado`}
          >
            <div className="credit-meter__head">
              <span>
                {formatCredits(used)} de {formatCredits(cap)} créditos
              </span>
              <strong>{percent}%</strong>
            </div>
            <div className="credit-meter__track">
              <div
                className={`credit-meter__fill ${meterTone(percent, remaining)}`.trim()}
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <p className="credit-meter__meta">
              {remaining > 0
                ? `${formatCredits(remaining)} créditos restantes este mes`
                : "Tope del mes agotado. Sube el número para seguir prospectando."}
              {budget.searches_this_month > 0
                ? ` · ${formatCredits(budget.searches_this_month)} búsquedas`
                : ""}
            </p>
          </div>

          <form className="credit-meter__form" onSubmit={(event) => void save(event)}>
            <FieldLabel htmlFor="apollo-budget">Tope mensual de créditos</FieldLabel>
            <div className="credit-meter__row">
              <input
                id="apollo-budget"
                className="input-field"
                type="number"
                inputMode="numeric"
                min={1}
                max={1_000_000}
                step={1}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={saving}
              />
              <button type="submit" className="btn-primary" disabled={saving || unchanged}>
                {saving ? "Guardando..." : "Guardar tope"}
              </button>
            </div>
            <p className="text-micro">
              El número vale solo este mes. El consumo también vuelve a cero al empezar el mes, y los
              créditos reales se siguen comprando en Apollo.io.
            </p>
          </form>
        </div>
      )}
    </main>
  );
}
