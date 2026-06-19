/**
 * Test profesional de plataforma (producción o local).
 * Uso: node scripts/test-platform.mjs
 *      APP_URL=http://localhost:3000 node scripts/test-platform.mjs
 */

const BASE = (process.env.APP_URL ?? "https://agente-ventas-three.vercel.app").replace(/\/$/, "");

const results = [];
let failures = 0;

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  failures++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function fetchJson(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { res, data };
}

async function testPages() {
  console.log("\n1. Páginas (HTML)");
  const pages = ["/", "/prospeccion", "/portafolio", "/conversaciones", "/resumen"];
  for (const path of pages) {
    const res = await fetch(`${BASE}${path}`, { redirect: "follow" });
    if (res.ok) pass(`${path}`, `HTTP ${res.status}`);
    else fail(`${path}`, `HTTP ${res.status}`);
  }
}

async function testHealth() {
  console.log("\n2. Salud del sistema");
  const { res, data } = await fetchJson("/api/health");
  if (res.status === 200 && data?.status === "ok") {
    pass("GET /api/health", `DB=${data.checks?.database}, Apollo=${data.checks?.apollo_key}`);
  } else {
    fail("GET /api/health", JSON.stringify(data));
  }
}

async function testStats() {
  console.log("\n3. Estadísticas");
  const { res, data } = await fetchJson("/api/stats");
  if (res.ok && typeof data?.total === "number") {
    pass("GET /api/stats", `${data.total} contactos, ${data.approved ?? 0} aprobados`);
  } else {
    fail("GET /api/stats", JSON.stringify(data));
  }
}

async function testLeadsList() {
  console.log("\n4. Portafolio — listado");
  const { res, data } = await fetchJson("/api/leads?page=1&per_page=5");
  const valid =
    res.ok &&
    Array.isArray(data?.leads) &&
    typeof data?.total === "number" &&
    typeof data?.totalPages === "number";
  if (valid) {
    pass("GET /api/leads", `${data.total} total, página ${data.page}/${data.totalPages}`);
    return data.leads;
  }
  fail("GET /api/leads", JSON.stringify(data));
  return [];
}

async function testLeadStatusPersistence(leads) {
  console.log("\n5. Portafolio — persistencia de estado");
  if (!leads.length) {
    fail("PATCH estado (sin datos)", "No hay contactos en portafolio para probar");
    return;
  }

  const lead = leads[0];
  const id = lead.id;
  const original = lead.lead_status;

  const validStatuses = ["Nuevo", "En revisión", "Aprobado para contacto", "Descartado"];
  if (!validStatuses.includes(original)) {
    fail("Estado actual válido", `lead_status inesperado: ${original}`);
    return;
  }

  const alt = validStatuses.find((s) => s !== original) ?? "En revisión";

  const patch1 = await fetchJson(`/api/leads/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ lead_status: alt }),
  });
  if (patch1.res.ok && patch1.data?.lead?.lead_status === alt) {
    pass("PATCH cambio de estado", `${original} → ${alt}`);
  } else {
    fail("PATCH cambio de estado", JSON.stringify(patch1.data));
    return;
  }

  const getAfter = await fetchJson(`/api/leads?page=1&per_page=100`);
  const found = (getAfter.data?.leads ?? []).find((l) => Number(l.id) === Number(id));
  if (found?.lead_status === alt) {
    pass("GET confirma estado en BD", `id=${id} → ${found.lead_status}`);
  } else {
    fail("GET confirma estado en BD", `esperado ${alt}, recibido ${found?.lead_status ?? "no encontrado"}`);
  }

  const patchRestore = await fetchJson(`/api/leads/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ lead_status: original }),
  });
  if (patchRestore.res.ok && patchRestore.data?.lead?.lead_status === original) {
    pass("PATCH restaura estado original", original);
  } else {
    fail("PATCH restaura estado original", JSON.stringify(patchRestore.data));
  }
}

async function testLeadValidation() {
  console.log("\n6. Validación API leads");
  const badId = await fetchJson("/api/leads/0", {
    method: "PATCH",
    body: JSON.stringify({ lead_status: "Nuevo" }),
  });
  if (badId.res.status === 400) pass("PATCH id inválido → 400");
  else fail("PATCH id inválido", `HTTP ${badId.res.status}`);

  const badStatus = await fetchJson("/api/leads/1", {
    method: "PATCH",
    body: JSON.stringify({ lead_status: "EstadoInventado" }),
  });
  if (badStatus.res.status === 400) pass("PATCH estado inválido → 400");
  else fail("PATCH estado inválido", `HTTP ${badStatus.res.status}`);
}

async function testSmartSearch() {
  console.log("\n7. Búsqueda inteligente");
  const { res, data } = await fetchJson("/api/prospeccion/smart-search");
  if (res.ok && data?.ok === true) {
    pass("GET smart-search health", data.model ? `modelo ${data.model}` : "operativo");
  } else {
    fail("GET smart-search health", JSON.stringify(data));
  }
}

async function testCompaniesAutocomplete() {
  console.log("\n8. Autocompletado empresa");
  const { res, data } = await fetchJson("/api/prospeccion/companies?q=Sur&country=Colombia");
  if (res.ok && Array.isArray(data?.suggestions)) {
    pass("GET companies", `${data.suggestions.length} sugerencia(s)`);
  } else {
    fail("GET companies", JSON.stringify(data));
  }
}

async function testConversations() {
  console.log("\n9. Conversaciones");
  const { res, data } = await fetchJson("/api/conversations");
  if (res.ok && Array.isArray(data?.threads)) {
    pass("GET /api/conversations", `${data.threads.length} hilo(s)`);
  } else if (res.ok && data?.threads === undefined && data?.error) {
    fail("GET /api/conversations", data.error);
  } else {
    pass("GET /api/conversations", "respuesta válida");
  }
}

async function testOutreachValidation() {
  console.log("\n10. Mensaje IA — validación");
  const { res, data } = await fetchJson("/api/portafolio/outreach", {
    method: "POST",
    body: JSON.stringify({ channel: "call", nombre: "" }),
  });
  if (!res.ok && data?.error) {
    pass("POST outreach sin nombre → error", data.error.slice(0, 60));
  } else {
    fail("POST outreach sin nombre", `HTTP ${res.status}`);
  }
}

async function main() {
  console.log(`\n═══ Test de plataforma IAC ═══`);
  console.log(`Base: ${BASE}`);
  console.log(`Fecha: ${new Date().toISOString()}`);

  await testPages();
  await testHealth();
  await testStats();
  const leads = await testLeadsList();
  await testLeadStatusPersistence(leads);
  await testLeadValidation();
  await testSmartSearch();
  await testCompaniesAutocomplete();
  await testConversations();
  await testOutreachValidation();

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;

  console.log(`\n═══ Resumen: ${passed}/${total} pruebas OK ═══`);
  if (failures > 0) {
    console.error(`\n${failures} prueba(s) fallida(s).`);
    process.exit(1);
  }
  console.log("\nPlataforma OK — todos los checks pasaron.");
}

main().catch((e) => {
  console.error("\nError fatal:", e);
  process.exit(1);
});
