/** Si la sesión caducó, manda al login. Devuelve true si ya redirigió. */
export function redirectToLoginIfUnauthorized(res: Response): boolean {
  if (res.status !== 401) return false;
  if (typeof window === "undefined") return false;
  if (window.location.pathname.startsWith("/login")) return false;
  const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
  window.location.assign(`/login?next=${next}`);
  return true;
}

/** Lee respuesta de API; evita fallos de JSON cuando Vercel devuelve texto plano. */
export async function parseApiResponse<T = Record<string, unknown>>(
  res: Response
): Promise<{ data: T | null; error: string | null }> {
  if (redirectToLoginIfUnauthorized(res)) {
    return { data: null, error: "Sesión expirada. Vuelve a entrar." };
  }
  const text = await res.text();
  if (!text.trim()) {
    return {
      data: null,
      error:
        res.status === 504 || res.status === 502
          ? "La búsqueda tardó demasiado. Reduce la cantidad de resultados o simplifica los filtros."
          : `Error del servidor (${res.status})`,
    };
  }

  try {
    return { data: JSON.parse(text) as T, error: null };
  } catch {
    const timeoutLike =
      res.status === 504 ||
      res.status === 502 ||
      /an error occurred|timeout|timed out|function_invocation/i.test(text);

    return {
      data: null,
      error: timeoutLike
        ? "La búsqueda tardó demasiado. Reduce la cantidad de resultados o simplifica los filtros."
        : text.slice(0, 280),
    };
  }
}
