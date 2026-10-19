type Sql = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
};

type Migration = {
  id: string;
  run: (sql: Sql) => Promise<void>;
};

async function migration001Init(sql: Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      apollo_id TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      cargo TEXT,
      empresa TEXT,
      email TEXT,
      telefono TEXT,
      pais TEXT,
      linkedin_url TEXT,
      lead_status TEXT NOT NULL DEFAULT 'Nuevo',
      whatsapp_status TEXT NOT NULL DEFAULT 'No iniciado',
      notas TEXT,
      fuente_busqueda TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS apollo_phone_cache (
      apollo_id TEXT PRIMARY KEY,
      telefono TEXT NOT NULL DEFAULT '',
      requested_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    ALTER TABLE apollo_phone_cache ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS apollo_prospeccion_credits (
      id SERIAL PRIMARY KEY,
      credits INTEGER NOT NULL DEFAULT 0,
      contactos_enriquecidos INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'search',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_leads_status_created
    ON leads (lead_status, created_at DESC)
  `;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS mistral_conversation_id TEXT`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_status TEXT NOT NULL DEFAULT 'Nuevo'`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_status TEXT NOT NULL DEFAULT 'No iniciado'`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS notas TEXT`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS fuente_busqueda TEXT`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
  await sql`
    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      telefono TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_wa_messages_lead_created
    ON whatsapp_messages (lead_id, created_at DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_status
    ON leads (whatsapp_status, updated_at DESC)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS knowledge_profile (
      id INTEGER PRIMARY KEY DEFAULT 1,
      name TEXT NOT NULL DEFAULT '',
      tagline TEXT NOT NULL DEFAULT '',
      experience TEXT NOT NULL DEFAULT '',
      scale TEXT NOT NULL DEFAULT '',
      sectors TEXT NOT NULL DEFAULT '',
      consultant TEXT NOT NULL DEFAULT '',
      consultant_role TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      web TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL,
      mime TEXT,
      kind TEXT NOT NULL,
      extracted_text TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      structured JSONB,
      char_count INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS knowledge_personas (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      sector TEXT NOT NULL DEFAULT '',
      characteristics TEXT NOT NULL DEFAULT '',
      value_for_client TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function migration002PhoneSearch(sql: Sql) {
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS telefono_e164 TEXT`;
  await sql`
    UPDATE leads
    SET telefono_e164 = CASE
      WHEN telefono IS NULL OR TRIM(telefono) = '' THEN NULL
      WHEN telefono LIKE '+%' THEN '+' || regexp_replace(telefono, '[^0-9]', '', 'g')
      WHEN length(regexp_replace(telefono, '[^0-9]', '', 'g')) = 10
        AND regexp_replace(telefono, '[^0-9]', '', 'g') LIKE '3%'
        THEN '+57' || regexp_replace(telefono, '[^0-9]', '', 'g')
      WHEN regexp_replace(telefono, '[^0-9]', '', 'g') LIKE '57%'
        AND length(regexp_replace(telefono, '[^0-9]', '', 'g')) BETWEEN 11 AND 13
        THEN '+' || regexp_replace(telefono, '[^0-9]', '', 'g')
      WHEN length(regexp_replace(telefono, '[^0-9]', '', 'g')) BETWEEN 8 AND 15
        THEN '+' || regexp_replace(telefono, '[^0-9]', '', 'g')
      ELSE NULL
    END
    WHERE telefono_e164 IS NULL
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_leads_telefono_e164
    ON leads (telefono_e164)
  `;
  try {
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_telefono_e164_uidx
      ON leads (telefono_e164)
      WHERE telefono_e164 IS NOT NULL
    `;
  } catch {
    /* duplicados existentes: el índice único no se crea, queda el índice normal */
  }
  await sql`
    CREATE INDEX IF NOT EXISTS idx_leads_nombre_lower
    ON leads (lower(nombre))
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_leads_empresa_lower
    ON leads (lower(empresa))
  `;
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_leads_nombre_trgm
      ON leads USING gin (nombre gin_trgm_ops)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_leads_empresa_trgm
      ON leads USING gin (empresa gin_trgm_ops)
    `;
  } catch {
    /* sin permisos de extensión: se usan los índices lower() */
  }
}

async function migration003AppSettings(sql: Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function migration004Users(sql: Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'disabled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id)`;
  await sql`ALTER TABLE knowledge_profile ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id)`;
  await sql`ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id)`;
  await sql`ALTER TABLE knowledge_personas ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id)`;
  await sql`ALTER TABLE apollo_prospeccion_credits ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id)`;
  await sql`ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_apollo_id_key`;
  await sql`DROP INDEX IF EXISTS idx_leads_telefono_e164_uidx`;
  await sql`CREATE INDEX IF NOT EXISTS idx_leads_owner_created ON leads (owner_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_credits_owner_created ON apollo_prospeccion_credits (owner_id, created_at DESC)`;
  try {
    await sql`CREATE SEQUENCE IF NOT EXISTS knowledge_profile_id_seq`;
    await sql`
      SELECT setval(
        'knowledge_profile_id_seq',
        GREATEST(COALESCE((SELECT MAX(id) FROM knowledge_profile), 0), 1),
        true
      )
    `;
    await sql`
      ALTER TABLE knowledge_profile
      ALTER COLUMN id SET DEFAULT nextval('knowledge_profile_id_seq')
    `;
    await sql`ALTER SEQUENCE knowledge_profile_id_seq OWNED BY knowledge_profile.id`;
  } catch {
    /* el perfil comercial puede seguir en la fila existente si la secuencia no se puede ajustar */
  }
}

async function migration005Gestion(sql: Sql) {
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS resultado_gestion TEXT`;
  await sql`
    UPDATE leads
    SET lead_status = 'En revisión',
        resultado_gestion = 'En seguimiento'
    WHERE lead_status = 'Aprobado para contacto'
  `;
  await sql`
    UPDATE leads
    SET lead_status = 'En revisión',
        resultado_gestion = 'No interesado'
    WHERE lead_status = 'Descartado'
  `;
}

const MIGRATIONS: Migration[] = [
  { id: "001_init", run: migration001Init },
  { id: "002_phone_search", run: migration002PhoneSearch },
  { id: "003_app_settings", run: migration003AppSettings },
  { id: "004_users", run: migration004Users },
  { id: "005_gestion", run: migration005Gestion },
];

export async function applyMigrations(sql: Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  const applied = (await sql`SELECT id FROM schema_migrations`) as Array<{ id: string }>;
  const done = new Set(applied.map((row) => row.id));

  for (const migration of MIGRATIONS) {
    if (done.has(migration.id)) continue;
    await migration.run(sql);
    await sql`INSERT INTO schema_migrations (id) VALUES (${migration.id})`;
  }
}
