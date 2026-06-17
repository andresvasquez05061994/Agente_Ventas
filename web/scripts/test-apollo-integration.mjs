/**
 * Test global integración Apollo.
 * Uso: node --env-file=.env.local scripts/test-apollo-integration.mjs
 * O desde raíz: node --env-file=web/.env.local web/scripts/test-apollo-integration.mjs
 */
const key = process.env.APOLLO_API_KEY;
const webhook =
  process.env.APOLLO_WEBHOOK_BASE_URL?.replace(/\/$/, "") ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

if (!key) {
  console.error("FAIL: APOLLO_API_KEY no configurada");
  process.exit(1);
}

const BASE = "https://api.apollo.io/api/v1";
const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-cache",
  accept: "application/json",
  "x-api-key": key,
};

const results = [];

function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
  console.log(`✓ ${name}${detail ? `: ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ ok: false, name, detail });
  console.error(`✗ ${name}${detail ? `: ${detail}` : ""}`);
}

async function postJson(url, body) {
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { res, text, json };
}

// 1. Search
const searchPayload = {
  page: 1,
  per_page: 5,
  contact_email_status: ["verified", "likely to engage"],
  person_locations: ["Colombia"],
  person_titles: ["IT Director"],
};

const { res: searchRes, json: searchData, text: searchText } = await postJson(
  `${BASE}/mixed_people/api_search`,
  searchPayload
);

if (!searchRes.ok) {
  fail("api_search", `${searchRes.status} ${searchText.slice(0, 200)}`);
  process.exit(1);
}

const people = searchData?.people ?? searchData?.contacts ?? [];
pass("api_search", `${people.length} perfiles, ${searchData?.total_entries ?? "?"} total`);

if (!people.length) {
  fail("candidatos", "sin perfiles para Colombia + IT Director");
  process.exit(1);
}

const first = people.find((p) => p.has_email !== false) ?? people[0];
const personId = first.person_id ?? first.id;
if (!personId) {
  fail("person_id", "primer perfil sin id");
  process.exit(1);
}
pass("person_id", String(personId));

// 2. bulk_match email
const detail = {
  id: String(personId),
  first_name: first.first_name,
  last_name: first.last_name ?? first.last_name_obfuscated,
  title: first.title,
  organization_name: first.organization?.name,
};

const bulkEmailUrl = `${BASE}/people/bulk_match?reveal_personal_emails=true&reveal_phone_number=false`;
const bulkEmailRes = await fetch(bulkEmailUrl, {
  method: "POST",
  headers,
  body: JSON.stringify({ details: [detail] }),
});
const bulkEmailText = await bulkEmailRes.text();
let bulkEmailJson = null;
try {
  bulkEmailJson = JSON.parse(bulkEmailText);
} catch {
  /* ignore */
}

if (!bulkEmailRes.ok) {
  fail("bulk_match email", `${bulkEmailRes.status} ${bulkEmailText.slice(0, 250)}`);
} else {
  const matches = bulkEmailJson?.matches ?? [];
  const email = matches[0]?.email;
  pass(
    "bulk_match email",
    `${matches.length} match(es), créditos ${bulkEmailJson?.credits_consumed ?? 0}, email=${email ? "sí" : "no"}`
  );

  // 3. bulk_match phone (si hay webhook)
  if (webhook && email) {
    const bulkPhoneUrl =
      `${BASE}/people/bulk_match?reveal_personal_emails=false&reveal_phone_number=true` +
      `&webhook_url=${encodeURIComponent(`${webhook}/api/apollo/phone-webhook`)}`;
    const bulkPhoneRes = await fetch(bulkPhoneUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ details: [{ id: String(personId) }] }),
    });
    const bulkPhoneText = await bulkPhoneRes.text();
    if (!bulkPhoneRes.ok) {
      fail("bulk_match phone", `${bulkPhoneRes.status} ${bulkPhoneText.slice(0, 250)}`);
    } else {
      pass("bulk_match phone", `créditos ${JSON.parse(bulkPhoneText)?.credits_consumed ?? "?"}`);
    }
  } else if (!webhook) {
    fail("webhook", "APOLLO_WEBHOOK_BASE_URL no configurado — teléfonos no se revelarán");
  }
}

// 4. App API (opcional)
const appUrl = process.env.APP_TEST_URL ?? "https://agente-ventas-three.vercel.app";
try {
  const appRes = await fetch(`${appUrl}/api/apollo/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      country: "Colombia",
      titles: ["IT Director"],
      keyword: "",
      seniority: "",
      per_page: 3,
    }),
    signal: AbortSignal.timeout(120000),
  });
  const appData = await appRes.json();
  if (appData.results?.length) {
    pass("app /api/apollo/search", `${appData.results.length} contactos completos`);
  } else {
    fail(
      "app /api/apollo/search",
      appData.error ??
        `0 resultados · scanned=${appData.meta?.scanned_profiles} matched=${appData.meta?.enrich_stats?.matched} errors=${JSON.stringify(appData.meta?.match_errors ?? [])}`
    );
  }
} catch (e) {
  fail("app /api/apollo/search", e instanceof Error ? e.message : "timeout/error");
}

const failed = results.filter((r) => !r.ok);
console.log(`\n--- ${results.length - failed.length}/${results.length} pruebas OK ---`);
process.exit(failed.length ? 1 : 0);
