import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getSql } from "./db";

export type UserRole = "admin" | "user";
export type UserStatus = "pending" | "approved" | "rejected" | "disabled";

export type AppUser = {
  id: number;
  email: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
};

export type UserAccount = AppUser & {
  leads: number;
  credits_this_month: number;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(normalizeEmail(value));
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 32).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPasswordHash(password: string, stored: string): boolean {
  const [algo, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const actual = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "base64url");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function mapUser(row: Record<string, unknown>): AppUser {
  return {
    id: Number(row.id),
    email: String(row.email),
    role: row.role === "admin" ? "admin" : "user",
    status: String(row.status) as UserStatus,
    created_at: new Date(String(row.created_at)).toISOString(),
  };
}

export async function getUserById(id: number): Promise<AppUser | null> {
  const sql = getSql();
  const rows = (await sql`SELECT id, email, role, status, created_at FROM users WHERE id = ${id}`) as Record<
    string,
    unknown
  >[];
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function getUserByEmail(email: string): Promise<(AppUser & { password_hash: string }) | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, email, role, status, created_at, password_hash
    FROM users WHERE email = ${normalizeEmail(email)}
  `) as Record<string, unknown>[];
  if (!rows[0]) return null;
  return { ...mapUser(rows[0]), password_hash: String(rows[0].password_hash) };
}

export async function getAdminUser(): Promise<AppUser | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, email, role, status, created_at
    FROM users WHERE role = 'admin'
    ORDER BY id ASC
    LIMIT 1
  `) as Record<string, unknown>[];
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function registerUser(email: string, password: string): Promise<AppUser> {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) throw new Error("Escribe un correo válido.");
  if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO users (email, password_hash, role, status)
    VALUES (${normalized}, ${hashPassword(password)}, 'user', 'pending')
    ON CONFLICT (email) DO NOTHING
    RETURNING id, email, role, status, created_at
  `) as Record<string, unknown>[];
  if (!rows[0]) throw new Error("Ese correo ya está registrado.");
  return mapUser(rows[0]);
}

export async function setUserStatus(id: number, status: UserStatus): Promise<AppUser> {
  const sql = getSql();
  const rows = (await sql`
    UPDATE users
    SET status = ${status}, updated_at = NOW()
    WHERE id = ${id} AND role <> 'admin'
    RETURNING id, email, role, status, created_at
  `) as Record<string, unknown>[];
  if (!rows[0]) throw new Error("No se puede cambiar el estado de esa cuenta.");
  return mapUser(rows[0]);
}

export async function listUserAccounts(): Promise<UserAccount[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      u.id, u.email, u.role, u.status, u.created_at,
      (SELECT COUNT(*)::int FROM leads l WHERE l.owner_id = u.id) AS leads,
      (
        SELECT COALESCE(SUM(c.credits), 0)::int
        FROM apollo_prospeccion_credits c
        WHERE c.owner_id = u.id
          AND c.created_at >= date_trunc('month', NOW() AT TIME ZONE 'UTC')
      ) AS credits_this_month
    FROM users u
    ORDER BY
      CASE u.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'disabled' THEN 2 ELSE 3 END,
      u.created_at DESC
  `) as Record<string, unknown>[];
  return rows.map((row) => ({
    ...mapUser(row),
    leads: Number(row.leads ?? 0),
    credits_this_month: Number(row.credits_this_month ?? 0),
  }));
}

/** Crea el administrador global y asigna los datos que existían antes de las cuentas. */
export async function ensurePlatform(): Promise<void> {
  const email = normalizeEmail(process.env.ADMIN_EMAIL ?? "");
  const password = process.env.ADMIN_PASSWORD?.trim() || process.env.APP_PASSWORD?.trim() || "";
  const sql = getSql();

  if (email && isValidEmail(email) && password.length >= 8) {
    const passwordHash = hashPassword(password);
    await sql`
      INSERT INTO users (email, password_hash, role, status)
      VALUES (${email}, ${passwordHash}, 'admin', 'approved')
      ON CONFLICT (email) DO UPDATE
        SET role = 'admin', status = 'approved', updated_at = NOW()
    `;
    if (process.env.ADMIN_PASSWORD?.trim()) {
      await sql`
        UPDATE users
        SET password_hash = ${passwordHash}, updated_at = NOW()
        WHERE email = ${email} AND role = 'admin'
      `;
    }
  }

  const admin = await getAdminUser();
  if (!admin) return;

  await sql`UPDATE leads SET owner_id = ${admin.id} WHERE owner_id IS NULL`;
  await sql`UPDATE knowledge_profile SET owner_id = ${admin.id} WHERE owner_id IS NULL`;
  await sql`UPDATE knowledge_documents SET owner_id = ${admin.id} WHERE owner_id IS NULL`;
  await sql`UPDATE knowledge_personas SET owner_id = ${admin.id} WHERE owner_id IS NULL`;
  await sql`UPDATE apollo_prospeccion_credits SET owner_id = ${admin.id} WHERE owner_id IS NULL`;

  await sql`
    UPDATE leads AS older
    SET apollo_id = older.apollo_id || ':' || older.id::text
    FROM (
      SELECT id
      FROM (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY owner_id, apollo_id
          ORDER BY updated_at DESC NULLS LAST, id DESC
        ) AS rn
        FROM leads
        WHERE owner_id IS NOT NULL
      ) ranked
      WHERE rn > 1
    ) dup
    WHERE older.id = dup.id
  `;
  await sql`
    DELETE FROM knowledge_profile
    WHERE owner_id IS NOT NULL
      AND id NOT IN (
        SELECT MAX(id) FROM knowledge_profile WHERE owner_id IS NOT NULL GROUP BY owner_id
      )
  `;

  const legacy = (await sql`
    SELECT value FROM app_settings WHERE key = 'apollo_monthly_budget'
  `) as Array<{ value: string }>;
  const adminKey = `apollo_monthly_budget:u${admin.id}`;
  if (legacy[0]?.value) {
    await sql`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (${adminKey}, ${legacy[0].value}, NOW())
      ON CONFLICT (key) DO NOTHING
    `;
  }

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_owner_apollo
    ON leads (owner_id, apollo_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_leads_owner_phone
    ON leads (owner_id, telefono_e164)
    WHERE telefono_e164 IS NOT NULL
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_profile_owner
    ON knowledge_profile (owner_id)
  `;
}
