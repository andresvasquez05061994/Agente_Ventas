const COUNTRY_DIAL: Array<{ needle: string; code: string }> = [
  { needle: "colombia", code: "57" },
  { needle: "mexico", code: "52" },
  { needle: "estados unidos", code: "1" },
  { needle: "united states", code: "1" },
  { needle: "usa", code: "1" },
  { needle: "peru", code: "51" },
  { needle: "chile", code: "56" },
  { needle: "argentina", code: "54" },
  { needle: "ecuador", code: "593" },
  { needle: "panama", code: "507" },
  { needle: "espana", code: "34" },
  { needle: "spain", code: "34" },
  { needle: "brasil", code: "55" },
  { needle: "brazil", code: "55" },
];

const DEFAULT_DIAL = "57";

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function foldCountry(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function dialCodeForCountry(hint?: string | null): string {
  if (!hint?.trim()) return DEFAULT_DIAL;
  const folded = foldCountry(hint);
  const match = COUNTRY_DIAL.find((item) => folded.includes(item.needle));
  return match?.code ?? DEFAULT_DIAL;
}

/** Normaliza a E.164. Por defecto asume Colombia (+57). */
export function toE164(
  raw: string | null | undefined,
  countryHint?: string | null
): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const digits = digitsOnly(trimmed);
  if (digits.length < 8 || digits.length > 15) return null;

  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("00") && digits.length >= 10) return `+${digits.slice(2)}`;

  const dial = dialCodeForCountry(countryHint);

  if (digits.startsWith(dial) && digits.length >= dial.length + 7) {
    return `+${digits}`;
  }

  if (dial === "57" && digits.length === 10 && digits.startsWith("3")) {
    return `+57${digits}`;
  }

  if (digits.length <= 10) return `+${dial}${digits}`;
  return `+${digits}`;
}

export function phoneMatchCandidates(
  raw: string | null | undefined,
  countryHint?: string | null
): string[] {
  if (!raw?.trim()) return [];
  const trimmed = raw.trim();
  const e164 = toE164(trimmed, countryHint);
  const digits = digitsOnly(trimmed);
  const out = new Set<string>();
  out.add(trimmed);
  if (e164) {
    out.add(e164);
    out.add(digitsOnly(e164));
  }
  if (digits) out.add(digits);
  return [...out];
}
