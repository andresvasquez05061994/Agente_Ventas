import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { saveKnowledgeProfile } from "@/lib/knowledge-store";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  try {
    await ensureDb();
    const body = (await req.json()) as Record<string, unknown>;
    const profile = await saveKnowledgeProfile({
      name: String(body.name ?? ""),
      tagline: String(body.tagline ?? ""),
      experience: String(body.experience ?? ""),
      scale: String(body.scale ?? ""),
      sectors: String(body.sectors ?? ""),
      consultant: String(body.consultant ?? ""),
      consultant_role: String(body.consultant_role ?? ""),
      email: String(body.email ?? ""),
      phone: String(body.phone ?? ""),
      web: String(body.web ?? ""),
      notes: String(body.notes ?? ""),
    });
    return NextResponse.json({ profile });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al guardar el perfil";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
