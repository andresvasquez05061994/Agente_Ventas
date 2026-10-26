import { NextRequest, NextResponse } from "next/server";
import { generateOutreachMessage, OutreachError } from "@/lib/commercial-outreach";
import { requireUser } from "@/lib/current-user";
import { ensureDb } from "@/lib/db";
import { assertMistralRateLimit, UsageLimitError } from "@/lib/usage-guard";

/** @deprecated Usar /api/portafolio/outreach */
export async function POST(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const body = (await req.json()) as Record<string, unknown>;
    await assertMistralRateLimit(actor.id);
    const result = await generateOutreachMessage(
      {
        nombre: String(body.nombre ?? ""),
        cargo: body.cargo != null ? String(body.cargo) : null,
        empresa: body.empresa != null ? String(body.empresa) : null,
        pais: body.pais != null ? String(body.pais) : null,
        email: body.email != null ? String(body.email) : null,
        notas: body.notas != null ? String(body.notas) : null,
        fuente: body.fuente != null ? String(body.fuente) : null,
      },
      "call",
      actor.id
    );
    return NextResponse.json(result);
  } catch (e) {
    const message =
      e instanceof UsageLimitError || e instanceof OutreachError
        ? e.message
        : "Error al generar mensaje comercial";
    const status =
      e instanceof UsageLimitError
        ? e.status
        : e instanceof OutreachError && e.status
          ? e.status
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
