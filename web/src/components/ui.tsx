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

export function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-card">
      <p className="metric-card__label">{label}</p>
      <p className="metric-card__value">{value}</p>
    </div>
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
