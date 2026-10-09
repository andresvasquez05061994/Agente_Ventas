import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { getKnowledgeProfile, listKnowledgeDocuments } from "@/lib/knowledge-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureDb();
    const [profile, documents] = await Promise.all([getKnowledgeProfile(), listKnowledgeDocuments()]);
    const active = documents.filter((doc) => doc.active).length;
    return NextResponse.json({
      profile,
      documents,
      meta: { total: documents.length, active },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al cargar conocimiento";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
