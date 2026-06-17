import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { initDb } from "@/lib/db";

export async function GET() {
  const checks = {
    apollo_key: Boolean(process.env.APOLLO_API_KEY),
    database_url: Boolean(process.env.DATABASE_URL),
    database: false,
  };

  if (checks.database_url) {
    try {
      await initDb();
      const sql = neon(process.env.DATABASE_URL!);
      await sql`SELECT 1`;
      checks.database = true;
    } catch {
      checks.database = false;
    }
  }

  const ok = checks.apollo_key && checks.database;
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", checks },
    { status: ok ? 200 : 503 }
  );
}
