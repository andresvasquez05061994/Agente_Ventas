/**
 * Cookie de sesión para scripts manuales.
 * Si TEAM_PASSWORD no está definido, no añade cabeceras (comportamiento anterior).
 */
export async function appSessionHeaders(baseUrl) {
  const password = process.env.TEAM_PASSWORD?.trim();
  if (!password) return {};

  const base = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
    redirect: "manual",
  });
  const chunks = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const cookie = chunks
    .map((line) => line.split(";")[0])
    .filter(Boolean)
    .join("; ");

  if (!res.ok || !cookie) {
    throw new Error(
      `TEAM_PASSWORD está definido pero el login en ${base} respondió HTTP ${res.status} sin cookie de sesión`
    );
  }
  return { Cookie: cookie };
}
