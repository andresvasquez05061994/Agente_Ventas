import { NextRequest, NextResponse } from "next/server";
import {
  APOLLO_BUDGET_MAX,
  APOLLO_BUDGET_MIN,
  parsePositiveInt,
} from "@/lib/credit-policy";
import { requireUser } from "@/lib/current-user";
import { ensureDb, setStoredApolloMonthlyBudget } from "@/lib/db";
import { getApolloBudgetSnapshot } from "@/lib/usage-guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const snapshot = await getApolloBudgetSnapshot(actor.id);
    return NextResponse.json(snapshot);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo leer el tope de Apollo";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureDb();
    const actor = await requireUser(req);
    if (actor instanceof NextResponse) return actor;
    const body = (await req.json().catch(() => null)) as { budget?: unknown } | null;
    const budget = parsePositiveInt(
      body?.budget == null ? undefined : String(body.budget),
      0
    );
    if (budget < APOLLO_BUDGET_MIN || budget > APOLLO_BUDGET_MAX) {
      return NextResponse.json(
        {
          error: `El tope debe ser un entero entre ${APOLLO_BUDGET_MIN.toLocaleString("es-CO")} y ${APOLLO_BUDGET_MAX.toLocaleString("es-CO")}.`,
        },
        { status: 400 }
      );
    }
    await setStoredApolloMonthlyBudget(actor.id, budget);
    const snapshot = await getApolloBudgetSnapshot(actor.id);
    return NextResponse.json(snapshot);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo guardar el tope de Apollo";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
