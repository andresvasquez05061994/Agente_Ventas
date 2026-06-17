export function PageLoader({ label = "Cargando..." }: { label?: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#003A70] border-t-transparent dark:border-[#4A8FD4] dark:border-t-transparent" />
      <p className="text-caption">{label}</p>
    </main>
  );
}
