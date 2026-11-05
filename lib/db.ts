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

function createPool() {
  const pool = new Pool({
    connectionString: getDatabaseUrl(),
    ssl: {
      rejectUnauthorized: false,
    },
    // O Neon encerra conexões paradas; o pool solta as suas antes disso e não espera para sempre por uma nova.
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });

  // Sem este aviso, uma conexão parada derrubada pelo banco gera um erro sem tratamento e derruba o servidor
  // (as requisições daquele momento falham, ex.: o convite não carrega). O pool já descarta a conexão sozinho.
  pool.on('error', (error) => {
    console.error('Conexao do banco encerrada inesperadamente (sera recriada)', error.message);
  });

  return pool;
}

export const db = global.__dbPool__ ?? createPool();

if (process.env.NODE_ENV !== 'production') {
  global.__dbPool__ = db;
}
