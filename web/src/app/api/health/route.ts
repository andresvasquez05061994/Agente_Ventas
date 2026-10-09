import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { ensureDb } from "@/lib/db";

export async function GET() {
  let database = false;
  if (process.env.DATABASE_URL) {
    try {
      await ensureDb();
      const sql = neon(process.env.DATABASE_URL);
      await sql`SELECT 1`;
      database = true;
    } catch {
      database = false;
    }
  }

  return NextResponse.json(
    { status: database ? "ok" : "degraded" },
    { status: database ? 200 : 503 }
  );
}
