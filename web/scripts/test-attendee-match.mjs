/**
 * Similitud de asistentes: tildes, marca de empresa y país distinto (feria).
 * npx tsx --tsconfig tsconfig.json scripts/test-attendee-match.mjs
 */
import {
  buildAttendeeSearchPayloads,
  buildIdentifyDetail,
  foldPersonQuery,
  locationsOf,
  obfuscatedSurnamesFit,
  obfuscatedTokenFits,
  parseMatchCountries,
  personSearchVariants,
  pickAttendeeCandidate,
} from "../src/lib/apollo-attendee-match.ts";
import { nameScore } from "../src/lib/excel-attendees.ts";
import { companySearchHint } from "../src/lib/excel-companies.ts";
import { organizationMatchesLoose } from "../src/lib/apollo-filters.ts";

const cases = [];

function check(name, ok) {
  cases.push([name, ok]);
}

check("query sin tildes", foldPersonQuery("ANDRÉ CASTELO PICHEL") === "andre castelo pichel");
check("marca corta APDTIC", companySearchHint("APDTIC - Profesionales del derecho TIC") === "APDTIC");
check("marca corta QUOBIS", companySearchHint("QUOBIS - seguridad voz") === "QUOBIS");
check(
  "empresa suelta no se recorta",
  companySearchHint("CONCEPTO MOVIL SAS").toLowerCase().includes("concepto")
);
check(
  "nombre con tilde es la misma persona",
  nameScore("ANDRÉ CASTELO PICHEL", "Andre Castelo Pichel") === 100
);
check(
  "apellido recortado sigue coincidiendo",
  nameScore("ANTONIO CORREA", "Antonio Correa Arguello") >= 70
);
check("letra latina equivalente coincide", nameScore("Łukasz Kowalski", "Lukasz Kowalski") === 100);
check("error de una letra en apellido largo coincide", nameScore("Andrés Zapata", "Andres Zpata") >= 70);
check("dos apellidos generan la variante con el primero", personSearchVariants("Iago Soto Mata").includes("iago soto"));

const andre = {
  id: "apollo-andre",
  name: "Andre Castelo Pichel",
  title: "Managing Partner",
  country: "Spain",
  present_raw_address: "Santiago de Compostela, Spain",
  organization: { name: "APDTIC - Profesionales del derecho TIC", country: "Spain" },
};

const otherApdtic = {
  id: "apollo-paula",
  name: "Paula Gonzalez Choren",
  country: "Spain",
  organization: { name: "APDTIC - Profesionales del derecho TIC" },
};

const input = {
  name: "ANDRÉ CASTELO PICHEL",
  title: "Socio Director",
  company: "APDTIC - Profesionales del derecho TIC",
  country: "Colombia",
};

const picked = pickAttendeeCandidate([otherApdtic, andre], input);
check("Colombia no elige a alguien de España", picked == null);
check("no toma a otra persona de la misma empresa", pickAttendeeCandidate([otherApdtic], input) == null);

const payloads = buildAttendeeSearchPayloads(input);
check("con país, todas las búsquedas filtran ubicación", payloads.every((p) => Array.isArray(p.person_locations) && p.person_locations.includes("Colombia")));
check("busca primero por marca y país", payloads[0].q_organization_name === "APDTIC" && payloads[0].person_locations?.[0] === "Colombia");
check("no manda el cargo en español a Apollo", payloads.every((p) => !p.person_titles));
check("keywords van sin tilde para que Apollo los encuentre", payloads[0].q_keywords === "ANDRE CASTELO PICHEL");
check("también prueba el nombre con tilde", payloads.some((p) => p.q_keywords === "ANDRÉ CASTELO PICHEL"));
check("no exige email verificado para aparecer", payloads.every((p) => !p.contact_email_status));
const iagoPayloads = buildAttendeeSearchPayloads({ name: "Iago Soto Mata", company: "QUOBIS - seguridad voz", countries: [] });
check("consulta Apollo con nombre y primer apellido", iagoPayloads.some((p) => p.q_keywords === "iago soto"));

const identify = buildIdentifyDetail(input);
check("match manda el nombre sin tilde", identify.name === "ANDRE CASTELO PICHEL");
check("match manda primer nombre y apellidos", identify.first_name === "ANDRE" && identify.last_name === "CASTELO PICHEL");
check("match manda la marca corta", identify.organization_name === "APDTIC");
check("la máscara Ca***o calza con Castelo", obfuscatedTokenFits("castelo", "Ca***o"));
check("la máscara Ca***l no calza con Castelo", obfuscatedTokenFits("castelo", "Ca***l") === false);
check("la máscara Pi***l calza con Pichel", obfuscatedTokenFits("pichel", "Pi***l"));
check(
  "la máscara del apellido compuesto Ca***l calza con Castelo Pichel",
  obfuscatedSurnamesFit(["castelo", "pichel"], "Ca***l")
);
check(
  "un apellido que no termina en esa letra no calza",
  obfuscatedSurnamesFit(["castelo"], "Ca***l") === false
);
check(
  "APDTIC corto calza con el nombre largo",
  organizationMatchesLoose("APDTIC", "APDTIC - Profesionales del derecho TIC")
);

const worldwide = { ...input, countries: [], country: undefined };
check("todos los países no manda ubicación", locationsOf(worldwide).length === 0);
check(
  "todos los países omite person_locations",
  buildAttendeeSearchPayloads(worldwide).every((p) => !p.person_locations)
);
check("elige a André en búsqueda mundial", pickAttendeeCandidate([otherApdtic, andre], worldwide)?.id === "apollo-andre");

const multi = { ...input, countries: ["Colombia", "Spain"], country: undefined };
check("varios países se mandan juntos", locationsOf(multi).join(",") === "Colombia,Spain");
check(
  "payload con varios países incluye Colombia y España en todas las búsquedas",
  buildAttendeeSearchPayloads(multi).every(
    (p) => Array.isArray(p.person_locations) && p.person_locations.includes("Colombia") && p.person_locations.includes("Spain")
  )
);
check("Colombia no aparece en payloads mundiales", buildAttendeeSearchPayloads(worldwide).every((p) => !p.person_locations));
check("elige a André si España está entre los países", pickAttendeeCandidate([otherApdtic, andre], multi)?.id === "apollo-andre");

check("all_countries gana sobre la lista", parseMatchCountries({ all_countries: true, countries: ["Colombia"] }).countries?.length === 0);
check("país único sigue valiendo", parseMatchCountries({ country: "Colombia" }).countries?.[0] === "Colombia");
check("varios países desde el body", parseMatchCountries({ countries: ["Colombia", "Spain"] }).countries?.join(",") === "Colombia,Spain");
check("país inventado se rechaza", Boolean(parseMatchCountries({ country: "France" }).error));

let failed = 0;
for (const [name, ok] of cases) {
  if (ok) console.log(`  ✓ ${name}`);
  else {
    console.error(`  ✗ ${name}`);
    failed += 1;
  }
}

if (failed) {
  console.error(payloads);
  console.error(`\n${failed} aserción(es) fallida(s).`);
  process.exit(1);
}
console.log("\nSimilitud de asistentes OK");
