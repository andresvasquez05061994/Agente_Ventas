export function PageLoader({ label = "Cargando..." }: { label?: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#003366] border-t-transparent dark:border-[#4A8FD4] dark:border-t-transparent" />
      <p className="text-sm text-[#6B7C93]">{label}</p>
    </main>
  );
}
