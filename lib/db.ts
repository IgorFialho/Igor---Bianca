import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __dbPool__: Pool | undefined;
}

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL nao configurada.');
  }

  return databaseUrl;
}

export const db =
  global.__dbPool__ ??
  new Pool({
    connectionString: getDatabaseUrl(),
    ssl: {
      rejectUnauthorized: false,
    },
  });

if (process.env.NODE_ENV !== 'production') {
  global.__dbPool__ = db;
}
