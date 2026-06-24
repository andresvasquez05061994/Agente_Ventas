/** Lee respuesta de API; evita fallos de JSON cuando Vercel devuelve texto plano. */
export async function parseApiResponse<T = Record<string, unknown>>(
  res: Response
): Promise<{ data: T | null; error: string | null }> {
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
