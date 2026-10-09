import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import {
  extractKnowledgeText,
  knowledgeKindFromFilename,
  MAX_KNOWLEDGE_DOCS,
  MAX_KNOWLEDGE_FILE_BYTES,
  structureKnowledgeWithMistral,
  summarizeExtract,
} from "@/lib/knowledge-extract";
import { countKnowledgeDocuments, insertKnowledgeDocument } from "@/lib/knowledge-store";
import { assertMistralRateLimit, UsageLimitError } from "@/lib/usage-guard";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await ensureDb();
    assertMistralRateLimit();
    const count = await countKnowledgeDocuments();
    if (count >= MAX_KNOWLEDGE_DOCS) {
      return NextResponse.json(
        { error: `Máximo ${MAX_KNOWLEDGE_DOCS} documentos. Elimina alguno para cargar otro.` },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Adjunta un archivo PDF, Word o Excel." }, { status: 400 });
    }
    if (!knowledgeKindFromFilename(file.name)) {
      return NextResponse.json(
        { error: "Formato no válido. Usa PDF, Word (.docx), Excel (.xlsx, .xls, .csv) o .txt." },
        { status: 400 }
      );
    }
    if (file.size > MAX_KNOWLEDGE_FILE_BYTES) {
      return NextResponse.json({ error: "El archivo supera 4 MB." }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const extracted = await extractKnowledgeText(file.name, bytes);
    const structured = await structureKnowledgeWithMistral(extracted.text);
    const summary =
      structured?.services[0]?.summary ?? summarizeExtract(extracted.text);

    const document = await insertKnowledgeDocument({
      filename: file.name,
      mime: file.type || null,
      kind: extracted.kind,
      extracted_text: extracted.text,
      summary,
      structured,
    });

    return NextResponse.json({ document });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo leer el documento";
    const status = e instanceof UsageLimitError ? e.status : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
