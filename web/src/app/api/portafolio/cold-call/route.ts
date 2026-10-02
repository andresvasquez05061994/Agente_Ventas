import { NextResponse } from "next/server";
import { generateOutreachMessage, OutreachError } from "@/lib/commercial-outreach";
import { requireTeamApi } from "@/lib/session";

/** @deprecated Usar /api/portafolio/outreach */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireTeamApi();
  if (denied) return denied;
  try {
    const body = (await req.json()) as Record<string, unknown>;
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
      "call"
    );
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof OutreachError ? e.message : "Error al generar mensaje comercial";
    const status = e instanceof OutreachError && e.status ? e.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
