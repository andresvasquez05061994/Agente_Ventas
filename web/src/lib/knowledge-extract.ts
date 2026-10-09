import type { IACSolution } from "./iac-portfolio-knowledge";
import { getMistralModel, isMistralConfigured } from "./smart-search";

export const MAX_KNOWLEDGE_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_KNOWLEDGE_DOCS = 15;
export const MAX_EXTRACT_CHARS = 60_000;

export type KnowledgeKind = "pdf" | "docx" | "xlsx" | "txt";

const KIND_BY_EXT: Record<string, KnowledgeKind> = {
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
  xls: "xlsx",
  csv: "xlsx",
  txt: "txt",
};

export function knowledgeKindFromFilename(filename: string): KnowledgeKind | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return KIND_BY_EXT[ext] ?? null;
}

function cleanExtracted(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, MAX_EXTRACT_CHARS);
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  const { extractText } = await import("unpdf");
  const result = await extractText(bytes, { mergePages: true });
  const text = Array.isArray(result.text) ? result.text.join("\n") : String(result.text ?? "");
  return text;
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  const extracted = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return extracted.value ?? "";
}

async function extractSpreadsheet(bytes: Uint8Array, filename: string): Promise<string> {
  const XLSX = await import("xlsx");
  const lower = filename.toLowerCase();
  const workbook = lower.endsWith(".csv")
    ? XLSX.read(new TextDecoder("utf-8").decode(bytes), { type: "string" })
    : XLSX.read(bytes, { type: "array" });

  const parts: string[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    }) as unknown[][];
    const lines = rows
      .map((row) =>
        (Array.isArray(row) ? row : [])
          .map((cell) => String(cell ?? "").trim())
          .filter(Boolean)
          .join(" | ")
      )
      .filter(Boolean);
    if (lines.length) parts.push(`Hoja ${name}\n${lines.join("\n")}`);
  }
  return parts.join("\n\n");
}

export async function extractKnowledgeText(
  filename: string,
  bytes: Uint8Array
): Promise<{ kind: KnowledgeKind; text: string }> {
  const kind = knowledgeKindFromFilename(filename);
  if (!kind) {
    throw new Error("Usa PDF, Word (.docx), Excel (.xlsx, .xls, .csv) o texto.");
  }
  let raw = "";
  if (kind === "pdf") raw = await extractPdf(bytes);
  else if (kind === "docx") raw = await extractDocx(bytes);
  else if (kind === "xlsx") raw = await extractSpreadsheet(bytes, filename);
  else raw = new TextDecoder("utf-8").decode(bytes);

  const text = cleanExtracted(raw);
  if (text.length < 40) {
    throw new Error("No pude extraer texto útil. Revisa que el archivo no sea solo imágenes.");
  }
  return { kind, text };
}

export type StructuredKnowledge = {
  services: IACSolution[];
};

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 8);
}

export async function structureKnowledgeWithMistral(text: string): Promise<StructuredKnowledge | null> {
  if (!isMistralConfigured()) return null;
  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  if (!apiKey) return null;

  const model = getMistralModel();
  const source = text.slice(0, 10_000);
  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 1600,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Extraes el portafolio comercial de una empresa. Respondes JSON válido en español. No inventes servicios que no estén en el texto.",
          },
          {
            role: "user",
            content: `Del siguiente documento, extrae los servicios o soluciones comerciales.

Texto:
${source}

JSON:
{
  "services": [
    {
      "id": "slug-corto",
      "name": "nombre del servicio",
      "summary": "qué resuelve en 1-2 oraciones",
      "metrics": ["métrica o resultado si aparece"],
      "fit_roles": ["cargos que más se benefician, en minúsculas"],
      "industries": ["sectores"],
      "talking_points": ["ángulos de conversación"]
    }
  ]
}

Máximo 8 servicios. Si el texto no describe oferta, devuelve { "services": [] }.`,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    const parsed = JSON.parse(content) as { services?: unknown[] };
    const services = (parsed.services ?? [])
      .map((raw, index): IACSolution | null => {
        if (!raw || typeof raw !== "object") return null;
        const item = raw as Record<string, unknown>;
        const name = String(item.name ?? "").trim();
        if (!name) return null;
        const id = String(item.id ?? "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, "-")
          .replace(/^-|-$/g, "");
        return {
          id: id || `servicio-${index + 1}`,
          name,
          summary: String(item.summary ?? "").trim() || name,
          metrics: asStringList(item.metrics),
          fit_roles: asStringList(item.fit_roles).map((r) => r.toLowerCase()),
          industries: asStringList(item.industries).map((r) => r.toLowerCase()),
          talking_points: asStringList(item.talking_points),
        };
      })
      .filter((item): item is IACSolution => item !== null);
    return { services };
  } catch {
    return null;
  }
}

export function summarizeExtract(text: string): string {
  const first = text.split(/\n+/).map((line) => line.trim()).filter((line) => line.length > 40)[0];
  return (first ?? text).slice(0, 280);
}
