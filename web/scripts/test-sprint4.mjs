/**
 * Contrato Sprint 4: E.164, webhook de teléfono, upsert y buyer persona.
 * node scripts/test-sprint4.mjs
 */

function digitsOnly(value) {
  return value.replace(/\D/g, "");
}

function dialCodeForCountry(hint) {
  if (!hint?.trim()) return "57";
  const folded = hint.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (folded.includes("mexico")) return "52";
  if (folded.includes("united states") || folded.includes("usa")) return "1";
  return "57";
}

function toE164(raw, countryHint) {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const digits = digitsOnly(trimmed);
  if (digits.length < 8 || digits.length > 15) return null;
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("00") && digits.length >= 10) return `+${digits.slice(2)}`;
  const dial = dialCodeForCountry(countryHint);
  if (digits.startsWith(dial) && digits.length >= dial.length + 7) return `+${digits}`;
  if (dial === "57" && digits.length === 10 && digits.startsWith("3")) return `+57${digits}`;
  if (digits.length <= 10) return `+${dial}${digits}`;
  return `+${digits}`;
}

function phoneMatchCandidates(raw, countryHint) {
  if (!raw?.trim()) return [];
  const e164 = toE164(raw, countryHint);
  const digits = digitsOnly(raw);
  return [...new Set([raw.trim(), e164, digits, e164 ? digitsOnly(e164) : null].filter(Boolean))];
}

function canSaveLead(email, telefono, pais) {
  const e164 = toE164(telefono, pais);
  return Boolean(email?.trim() && (e164 || telefono?.trim()));
}

function resolveApolloPersonId(raw) {
  const id = raw.person_id ?? raw.id;
  return id ? String(id) : "";
}

function extractPhone(raw) {
  const numbers = raw.phone_numbers;
  if (Array.isArray(numbers)) {
    for (const n of numbers) {
      const phone = n.sanitized_number ?? n.raw_number;
      if (phone?.trim()) return phone.trim();
    }
  }
  if (typeof raw.sanitized_phone === "string" && raw.sanitized_phone.trim()) return raw.sanitized_phone.trim();
  if (typeof raw.phone === "string" && raw.phone.trim()) return raw.phone.trim();
  return null;
}

function parsePhoneWebhookPayload(body) {
  const out = [];
  if (!body || typeof body !== "object") return out;
  for (const entry of body.people ?? []) {
    if (!entry || typeof entry !== "object") continue;
    const id = resolveApolloPersonId(entry);
    if (!id) continue;
    const phone = extractPhone(entry);
    if (phone) out.push({ apollo_id: id, telefono: toE164(phone) || phone });
  }
  return out;
}

function fold(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryTokens(query) {
  const stop = new Set(["de", "del", "la", "las", "los", "el", "y", "en", "para", "con"]);
  return fold(query)
    .split(" ")
    .filter((token) => token.length >= 4 && !stop.has(token));
}

function matchBuyerPersona(personas, cargo, hints) {
  if (!personas.length) return null;
  const hay = fold(`${cargo ?? ""} ${hints}`);
  let best = null;
  for (const persona of personas) {
    let score = 0;
    const roleTokens = queryTokens(`${persona.role} ${persona.name}`);
    const sectorTokens = queryTokens(persona.sector);
    for (const token of roleTokens) if (hay.includes(token)) score += 6;
    for (const token of sectorTokens) if (hay.includes(token)) score += 4;
    if (persona.role && fold(cargo ?? "").includes(fold(persona.role))) score += 8;
    if (!best || score > best.score) best = { persona, score };
  }
  if (!best || best.score < 6) return null;
  return best.persona;
}

const personas = [
  { name: "Director TI", role: "CIO", sector: "software", characteristics: "compra automatización" },
  { name: "Gerente RRHH", role: "HR Director", sector: "servicios", characteristics: "nómina" },
];

const webhook = parsePhoneWebhookPayload({
  people: [
    { id: "p1", phone_numbers: [{ sanitized_number: "3001234567" }] },
    { person_id: "p2", sanitized_phone: "+57 310 555 8899" },
    { id: "p3" },
  ],
});

const cases = [
  ["móvil Colombia 10 dígitos", toE164("3001234567") === "+573001234567"],
  ["ya E.164", toE164("+57 300 123 4567") === "+573001234567"],
  ["prefijo 57 sin plus", toE164("573001234567") === "+573001234567"],
  ["00 internacional", toE164("00573001234567") === "+573001234567"],
  ["México con hint", toE164("5512345678", "México") === "+525512345678"],
  ["basura corta se descarta", toE164("123") === null],
  ["lookup encuentra variantes", phoneMatchCandidates("300 123 4567").includes("+573001234567")],
  ["upsert exige email y teléfono", canSaveLead("a@b.com", "3001234567") === true],
  ["upsert omite sin teléfono", canSaveLead("a@b.com", "") === false],
  ["upsert omite sin email", canSaveLead("", "3001234567") === false],
  ["webhook guarda p1 normalizado", webhook[0]?.telefono === "+573001234567"],
  ["webhook guarda p2", webhook[1]?.apollo_id === "p2"],
  ["webhook ignora sin teléfono", webhook.length === 2],
  [
    "buyer persona por cargo",
    matchBuyerPersona(personas, "CIO", "software enterprise")?.name === "Director TI",
  ],
  [
    "buyer persona sin señal",
    matchBuyerPersona(personas, "Pasante", "otro tema") === null,
  ],
];

let failed = 0;
for (const [name, ok] of cases) {
  if (ok) console.log(`  ✓ ${name}`);
  else {
    console.error(`  ✗ ${name}`);
    failed += 1;
  }
}

if (failed) {
  console.error(`\n${failed} aserción(es) fallida(s).`);
  process.exit(1);
}
console.log("\nSprint 4 higiene OK");
