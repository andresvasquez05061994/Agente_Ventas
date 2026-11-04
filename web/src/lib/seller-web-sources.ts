import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { getSql } from "./db";
import type { StructuredKnowledge } from "./knowledge-extract";
import { structureKnowledgeWithMistral, summarizeExtract } from "./knowledge-extract";

const MAX_WEB_SOURCE_BYTES = 900_000;
const MAX_WEB_SOURCE_CHARS = 60_000;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;

export type SellerWebSource = {
  id: number;
  source_url: string;
  label: string;
  summary: string;
  structured: StructuredKnowledge | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type SellerWebSourceRecord = SellerWebSource & { extracted_text: string };

function normalizeUrl(value: string): URL {
  const raw = value.trim();
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Escribe una URL pública válida.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Solo se permiten URLs HTTP o HTTPS.");
  }
  if (url.username || url.password || !url.hostname) {
    throw new Error("La URL no puede incluir credenciales.");
  }
  url.hash = "";
  return url;
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family !== 6) return true;
  const lower = address.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true;
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return Boolean(mapped?.[1] && isPrivateIpv4(mapped[1]));
}

async function assertPublicUrl(url: URL): Promise<void> {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("La URL debe apuntar a un sitio público.");
  }
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("La URL debe apuntar a una dirección pública.");
    return;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error("No pude resolver el dominio público de esa URL.");
  }
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("La URL no apunta a una dirección pública permitida.");
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[^]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|canvas|iframe)[^>]*>[^]*?<\/\1>/gi, " ")
      .replace(/<(nav|footer|header|aside)[^>]*>[^]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|br|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  ).slice(0, MAX_WEB_SOURCE_CHARS);
}

function extractTag(html: string, expression: RegExp): string {
  const match = html.match(expression);
  return match ? decodeEntities(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()) : "";
}

function extractMeta(html: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEntities(match[1].trim());
  }
  return "";
}

async function readResponseText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEB_SOURCE_BYTES) {
    throw new Error("La página supera el límite de 900 KB para análisis.");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let total = 0;
  let text = "";
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_WEB_SOURCE_BYTES) {
        await reader.cancel();
        throw new Error("La página supera el límite de 900 KB para análisis.");
      }
      text += decoder.decode(next.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function fetchPublicHtml(initial: URL): Promise<{ url: URL; html: string }> {
  let current = initial;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
          "User-Agent": "IAC-Ventas-Reference-Analyzer/1.0",
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error("La URL redirigió sin indicar un destino.");
        current = new URL(location, current);
        continue;
      }
      if (!response.ok) throw new Error(`La página respondió ${response.status}.`);
      const type = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!type.includes("text/html") && !type.includes("application/xhtml") && !type.includes("text/plain")) {
        throw new Error("La URL no devolvió una página HTML o texto público.");
      }
      return { url: current, html: await readResponseText(response) };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("La página tardó demasiado en responder.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("La URL redirige demasiadas veces.");
}

function asStructured(value: unknown): StructuredKnowledge | null {
  if (!value || typeof value !== "object") {
    if (typeof value !== "string") return null;
    try {
      return asStructured(JSON.parse(value));
    } catch {
      return null;
    }
  }
  const services = (value as StructuredKnowledge).services;
  return Array.isArray(services) ? { services } : null;
}

function asDate(value: unknown): string {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function mapSource(row: Record<string, unknown>, includeText = false): SellerWebSourceRecord {
  return {
    id: Number(row.id),
    source_url: String(row.source_url ?? ""),
    label: String(row.label ?? ""),
    summary: String(row.summary ?? ""),
    structured: asStructured(row.structured),
    active: Boolean(row.active),
    created_at: asDate(row.created_at),
    updated_at: asDate(row.updated_at),
    extracted_text: includeText ? String(row.extracted_text ?? "") : "",
  };
}

export async function listSellerWebSources(ownerId: number): Promise<SellerWebSource[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, source_url, label, summary, structured, active, created_at, updated_at
    FROM seller_web_sources
    WHERE owner_id = ${ownerId}
    ORDER BY updated_at DESC, id DESC
  `) as Record<string, unknown>[];
  return rows.map((row) => mapSource(row));
}

export async function listActiveSellerWebSources(ownerId: number): Promise<SellerWebSourceRecord[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM seller_web_sources
    WHERE owner_id = ${ownerId} AND active = TRUE
    ORDER BY updated_at DESC, id DESC
  `) as Record<string, unknown>[];
  return rows.map((row) => mapSource(row, true));
}

export async function saveWebReferenceSource(input: {
  ownerId: number;
  sourceUrl: string;
  label: string;
  summary: string;
  extractedText: string;
  structured: StructuredKnowledge | null;
}): Promise<SellerWebSource> {
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO seller_web_sources (
      owner_id, source_url, label, summary, extracted_text, structured, active, created_at, updated_at
    ) VALUES (
      ${input.ownerId}, ${input.sourceUrl}, ${input.label.slice(0, 180)}, ${input.summary.slice(0, 600)},
      ${input.extractedText}, ${input.structured ? JSON.stringify(input.structured) : null}::jsonb,
      TRUE, NOW(), NOW()
    )
    ON CONFLICT (owner_id, source_url) DO UPDATE SET
      label = EXCLUDED.label,
      summary = EXCLUDED.summary,
      extracted_text = EXCLUDED.extracted_text,
      structured = EXCLUDED.structured,
      active = TRUE,
      updated_at = NOW()
    RETURNING id, source_url, label, summary, structured, active, created_at, updated_at
  `) as Record<string, unknown>[];
  return mapSource(rows[0]);
}

export async function setSellerWebSourceActive(
  ownerId: number,
  id: number,
  active: boolean
): Promise<SellerWebSource | null> {
  const sql = getSql();
  const rows = (await sql`
    UPDATE seller_web_sources
    SET active = ${active}, updated_at = NOW()
    WHERE owner_id = ${ownerId} AND id = ${id}
    RETURNING id, source_url, label, summary, structured, active, created_at, updated_at
  `) as Record<string, unknown>[];
  return rows[0] ? mapSource(rows[0]) : null;
}

export async function deleteSellerWebSource(ownerId: number, id: number): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM seller_web_sources
    WHERE owner_id = ${ownerId} AND id = ${id}
    RETURNING id
  `) as Array<{ id: number }>;
  return Boolean(rows[0]);
}

/** Analiza una única URL pública. No recorre enlaces ni supera autenticación o captchas. */
export async function analyzePublicWebReference(
  ownerId: number,
  rawUrl: string
): Promise<SellerWebSource> {
  const initial = normalizeUrl(rawUrl);
  const { url, html } = await fetchPublicHtml(initial);
  const text = htmlToText(html);
  if (text.length < 80) {
    throw new Error("No pude extraer texto comercial suficiente de la página pública.");
  }
  const title = extractTag(html, /<title[^>]*>([^]*?)<\/title>/i);
  const description =
    extractMeta(html, "description") || extractMeta(html, "og:description") || extractMeta(html, "twitter:description");
  const structured = await structureKnowledgeWithMistral(text);
  const label = title || url.hostname;
  const summary = structured?.services[0]?.summary || description || summarizeExtract(text);
  return saveWebReferenceSource({
    ownerId,
    sourceUrl: url.toString(),
    label,
    summary,
    extractedText: text,
    structured,
  });
}
