export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="section-label">{children}</p>;
}

export function FieldLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <label className={`field-label ${className}`}>{children}</label>;
}

export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="page-title">{children}</h1>;
}

export function PageSubtitle({ children }: { children: React.ReactNode }) {
  return <p className="page-subtitle">{children}</p>;
}

export type KpiAccent = "blue" | "teal" | "coral" | "gray";

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

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="kpi-grid">{children}</div>;
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
    <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
      <p className="text-caption mb-6">{message}</p>
      <a href={href} className="btn-primary px-6 py-2.5">
        {cta}
      </a>
    </div>
  );
}
