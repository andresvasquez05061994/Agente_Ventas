import { NextResponse } from "next/server";
import { ColdCallError, generateColdCallMessage } from "@/lib/cold-call";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const result = await generateColdCallMessage({
      nombre: String(body.nombre ?? ""),
      cargo: body.cargo != null ? String(body.cargo) : null,
      empresa: body.empresa != null ? String(body.empresa) : null,
      pais: body.pais != null ? String(body.pais) : null,
      notas: body.notas != null ? String(body.notas) : null,
      fuente: body.fuente != null ? String(body.fuente) : null,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof ColdCallError ? e.message : "Error al generar mensaje comercial";
    const status = e instanceof ColdCallError && e.status ? e.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
