export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="section-label">{children}</p>;
}

export type FeedbackTone = "success" | "error" | "warning" | "info";

const FEEDBACK_DEFAULT_TITLES: Record<FeedbackTone, string> = {
  success: "Acción completada",
  error: "No se pudo completar",
  warning: "Revisa los datos",
  info: "Información",
};

export function ActionBanner({
  tone,
  title,
  message,
  onDismiss,
  compact = false,
}: {
  tone: FeedbackTone;
  title?: string;
  message: string;
  onDismiss?: () => void;
  compact?: boolean;
}) {
  const displayTitle = title ?? FEEDBACK_DEFAULT_TITLES[tone];

  return (
    <div
      className={`action-banner action-banner--${tone}${compact ? " action-banner--compact" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="action-banner__icon" aria-hidden>
        {tone === "success" && "✓"}
        {tone === "error" && "!"}
        {tone === "warning" && "△"}
        {tone === "info" && "i"}
      </span>
      <div className="action-banner__body">
        <p className="action-banner__title">{displayTitle}</p>
        <p className="action-banner__message">{message}</p>
      </div>
      {onDismiss && (
        <button
          type="button"
          className="action-banner__dismiss"
          onClick={onDismiss}
          aria-label="Cerrar mensaje"
        >
          ×
        </button>
      )}
    </div>
  );
}

export function FeedbackAnchor({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`feedback-anchor ${className}`.trim()}>{children}</div>;
}

export function FieldLabel({
  children,
  className = "",
  htmlFor,
}: {
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <label className={`field-label ${className}`} htmlFor={htmlFor}>
      {children}
    </label>
  );
}

export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="page-title">{children}</h1>;
}

export function PageSubtitle({ children }: { children: React.ReactNode }) {
  return <p className="page-subtitle">{children}</p>;
}

export type KpiAccent = "blue" | "teal" | "coral" | "gray" | "amber";

export function KpiCard({
  label,
  value,
  sub,
  accent = "blue",
  tag,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: KpiAccent;
  tag?: { positive: boolean; label: string };
}) {
  const display =
    typeof value === "number" ? value.toLocaleString("es-CO") : value;

  return (
    <div className={`kpi-card kpi-card--${accent}`}>
      <p className="kpi-card__label" title={label}>
        {label}
      </p>
      <p className="kpi-card__value">{display}</p>
      {sub && (
        <p className="kpi-card__sub" title={sub}>
          {sub}
        </p>
      )}
      {tag && (
        <span
          className={`kpi-card__tag ${tag.positive ? "kpi-card__tag--pos" : "kpi-card__tag--neg"}`}
          title={tag.label}
        >
          {tag.label}
        </span>
      )}
    </div>
  );
}

export function KpiGrid({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`kpi-grid ${className}`.trim()}>{children}</div>;
}

export function SectionBlock({
  label,
  title,
  description,
  children,
}: {
  label: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section-block">
      <SectionLabel>{label}</SectionLabel>
      <h2 className="section-block__title">{title}</h2>
      <p className="section-block__desc">{description}</p>
      {children}
    </section>
  );
}

export function EmptyState({ message, href, cta }: { message: string; href: string; cta: string }) {
  return (
    <div className="empty-state">
      <svg
        className="empty-state__icon"
        width="64"
        height="64"
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden
      >
        <rect x="8" y="12" width="48" height="40" rx="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M20 24h24M20 32h16M20 40h20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <p className="empty-state__title">Sin datos aún</p>
      <p className="empty-state__desc">{message}</p>
      <a href={href} className="btn-primary px-6 py-2.5">
        {cta}
      </a>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton-block ${className}`.trim()} aria-hidden />;
}

export function SkeletonLines({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-line" style={{ width: `${100 - i * 12}%` }} />
      ))}
    </div>
  );
}
