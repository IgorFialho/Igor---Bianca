// Cria só as tabelas da lista de presentes (gifts e gift_contributions). Seguro para rodar mais de uma vez
// e não insere dados de exemplo, ao contrário de create-db.mjs. Uso: node scripts/create-gifts-tables.mjs
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

function readDatabaseUrl() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  const envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const match = envText.match(/^DATABASE_URL\s*=\s*"?(.+?)"?\s*$/m);
  const url = process.env.DATABASE_URL || match?.[1];
  if (!url) throw new Error('DATABASE_URL nao encontrada (.env.local ou variavel de ambiente).');
  return url.trim();
}

const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'db/schema.sql'), 'utf8');
const giftsSql = schemaSql.slice(schemaSql.indexOf('-- Lista de presentes'));

const client = new Client({ connectionString: readDatabaseUrl(), ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(giftsSql);
  await client.query('COMMIT');
  const check = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_name IN ('gifts', 'gift_contributions') ORDER BY table_name"
  );
  console.log('Tabelas prontas:', check.rows.map((row) => row.table_name).join(', '));
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Falha ao criar tabelas de presentes:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
