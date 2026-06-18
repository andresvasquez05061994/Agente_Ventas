/**
 * Prueba Mistral en producción (sin exponer la API key).
 * Uso: node scripts/test-mistral-production.mjs
 */

const BASE = process.env.APP_URL ?? "https://agente-ventas-three.vercel.app";

async function main() {
  console.log("GET", `${BASE}/api/prospeccion/smart-search`);
  const health = await fetch(`${BASE}/api/prospeccion/smart-search`);
  const healthData = await health.json();
  console.log("Health:", health.status, healthData);

  if (!healthData.ok) {
    console.error("\nMistral NO operativo en producción.");
    process.exit(1);
  }

  const query =
    "Busco directores de tecnología en empresas del sector salud en Colombia, empresa Sura";
  console.log("\nPOST interpretación:", query);
  const res = await fetch(`${BASE}/api/prospeccion/smart-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  console.log("Resultado:", res.status, JSON.stringify(data, null, 2));

  if (!res.ok || data.source !== "mistral") {
    console.error("\nLa búsqueda inteligente no usó Mistral.");
    process.exit(1);
  }

  console.log("\nOK — Mistral IA operativa en producción.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
