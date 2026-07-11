import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

function readDatabaseUrl() {
  const envPath = path.resolve(process.cwd(), '.env.local');

  if (!fs.existsSync(envPath)) {
    throw new Error('Arquivo .env.local nao encontrado.');
  }

  const envText = fs.readFileSync(envPath, 'utf8');
  const match = envText.match(/^DATABASE_URL\s*=\s*"?(.+?)"?\s*$/m);

  if (!match?.[1]) {
    throw new Error('DATABASE_URL nao encontrada em .env.local.');
  }

  return match[1].trim();
}

const databaseUrl = readDatabaseUrl();

const schemaSql = `
CREATE TABLE IF NOT EXISTS wedding_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  event_date DATE NOT NULL,
  event_time TIME NOT NULL,
  venue VARCHAR(180) NOT NULL,
  address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invitation_codes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  guest_name VARCHAR(150),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE invitation_codes
ADD COLUMN IF NOT EXISTS requires_children_details BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS rsvp_responses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invitation_code_id BIGINT REFERENCES invitation_codes(id) ON DELETE SET NULL,
  invite_code_used VARCHAR(80) NOT NULL,
  attendance VARCHAR(10) NOT NULL CHECK (attendance IN ('yes', 'no')),
  adults_count INTEGER NOT NULL DEFAULT 1 CHECK (adults_count >= 0),
  children_count INTEGER NOT NULL DEFAULT 0 CHECK (children_count >= 0),
  dietary_notes TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE rsvp_responses
ADD COLUMN IF NOT EXISTS responder_full_name VARCHAR(180);

CREATE TABLE IF NOT EXISTS rsvp_children (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rsvp_response_id BIGINT NOT NULL REFERENCES rsvp_responses(id) ON DELETE CASCADE,
  full_name VARCHAR(180) NOT NULL,
  age INTEGER NOT NULL CHECK (age >= 0 AND age <= 17),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invite_access_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invitation_code_id BIGINT REFERENCES invitation_codes(id) ON DELETE SET NULL,
  invite_code_used VARCHAR(80) NOT NULL,
  guest_name VARCHAR(150),
  ip_address VARCHAR(64),
  user_agent TEXT,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rsvp_invite_code ON rsvp_responses(invite_code_used);
CREATE INDEX IF NOT EXISTS idx_rsvp_submitted_at ON rsvp_responses(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_rsvp_children_response_id ON rsvp_children(rsvp_response_id);
CREATE INDEX IF NOT EXISTS idx_access_code ON invite_access_logs(invite_code_used);
CREATE INDEX IF NOT EXISTS idx_access_date ON invite_access_logs(accessed_at DESC);
`;

const seedSql = `
INSERT INTO wedding_events (title, event_date, event_time, venue, address)
SELECT
  'Cerimonia e Recepcao Ana & Bruno',
  DATE '2026-05-15',
  TIME '16:30',
  'Pampulha - Belo Horizonte',
  'Av. Otacílio Negrão de Lima, 7630 - Pampulha, Belo Horizonte - MG, 31365-450'
WHERE NOT EXISTS (SELECT 1 FROM wedding_events);

INSERT INTO invitation_codes (code, guest_name, is_active)
VALUES ('FLORESCER2026', 'Convidado Especial', TRUE)
ON CONFLICT (code) DO NOTHING;
`;

const client = new Client({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function main() {
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query(schemaSql);
    await client.query(seedSql);
    await client.query('COMMIT');

    const tableCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('wedding_events', 'invitation_codes', 'rsvp_responses', 'rsvp_children', 'invite_access_logs')
      ORDER BY table_name;
    `);

    console.log('Tabelas prontas no Neon:');
    for (const row of tableCheck.rows) {
      console.log(`- ${row.table_name}`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Falha ao criar schema no Neon.');
  console.error(error);
  process.exit(1);
});
