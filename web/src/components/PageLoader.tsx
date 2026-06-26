export function PageLoader({ label: _label }: { label?: string } = {}) {
  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <div className="skeleton-line w-48 h-8" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="kpi-skeleton" />
        ))}
      </div>
    </main>
  );
}
