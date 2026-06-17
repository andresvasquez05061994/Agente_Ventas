export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[#8A97A8] dark:text-[#6E7F94]">
      {children}
    </p>
  );
}

export function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-[#E2E6EA] bg-white p-4 dark:border-[#2A3544] dark:bg-[#1A222D]">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A97A8]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[#1A2332] dark:text-[#E8EEF4]">{value}</p>
    </div>
  );
}

export function EmptyState({ message, href, cta }: { message: string; href: string; cta: string }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
      <p className="mb-6 text-sm text-[#6B7C93]">{message}</p>
      <a
        href={href}
        className="rounded bg-[#003366] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#002244]"
      >
        {cta}
      </a>
    </div>
  );
}
