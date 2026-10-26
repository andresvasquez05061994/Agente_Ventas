/**
 * WhatsApp entrante: un móvil compartido por dos vendedores no se asigna.
 * npx tsx --tsconfig tsconfig.json scripts/test-inbound-lead.mjs
 */
import { resolveInboundLead } from "../src/lib/inbound-lead.ts";

let failed = 0;
function check(name, ok) {
  if (ok) console.log("  ✓", name);
  else {
    failed += 1;
    console.error("  ✗", name);
  }
}

check("sin contactos", resolveInboundLead([]).status === "none");

const one = resolveInboundLead([
  { id: 4, owner_id: 2, updated_at: "2026-01-01" },
  { id: 9, owner_id: 2, updated_at: "2026-06-01" },
]);
check("un solo dueño usa el contacto más reciente", one.status === "matched" && one.lead?.id === 9);

const mixed = resolveInboundLead([
  { id: 1, owner_id: 2, updated_at: "2026-06-01" },
  { id: 2, owner_id: 8, updated_at: "2026-01-01" },
]);
check("dos dueños no se asignan", mixed.status === "ambiguous");

const unowned = resolveInboundLead([
  { id: 3, owner_id: null, updated_at: "2026-02-01" },
  { id: 5, owner_id: 2, updated_at: "2026-03-01" },
]);
check("un contacto sin dueño junto a otro dueño no se asigna", unowned.status === "ambiguous");

if (failed) {
  console.error(`\n${failed} fallos`);
  process.exit(1);
}
console.log("\nAsignación de WhatsApp OK");
