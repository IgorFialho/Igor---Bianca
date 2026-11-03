import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';

// Autenticação do painel /admin.
// - Cada login cria uma sessão própria: o cookie leva um token aleatório e o banco guarda só o hash dele.
//   "Sair" apaga a sessão no banco, então um cookie copiado deixa de valer.
// - A sessão expira em 8 horas, ou após 2 horas sem uso.
// - Login com usuário (ADMIN_USERNAME) e senha (ADMIN_PASSWORD); trocar qualquer um na Vercel derruba as sessões abertas.
// - Tentativas erradas são limitadas por IP e no total (contra força bruta).

export const ADMIN_AUTH_COOKIE = 'igor_bianca_admin_session';

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const SESSION_IDLE_SECONDS = 60 * 60 * 2;
// Atualiza "último uso" no máximo a cada 5 minutos, para não escrever no banco a cada clique.
const SESSION_TOUCH_SECONDS = 60 * 5;

// Limites de tentativas erradas.
const ATTEMPT_WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_IP = 5;
const MAX_FAILURES_TOTAL = 30;

const MIN_PASSWORD_LENGTH = 12;

const sha256 = (value: string) => createHash('sha256').update(value).digest();
const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

/** Senha configurada na Vercel/.env.local; sem senha (ou curta demais) o login fica desligado. */
function getAdminPassword() {
  const password = process.env.ADMIN_PASSWORD ?? '';
  return password.length >= MIN_PASSWORD_LENGTH ? password : null;
}

/** Usuário configurado na Vercel/.env.local (sem diferenciar maiúsculas); sem usuário o login fica desligado. */
function getAdminUsername() {
  const username = (process.env.ADMIN_USERNAME ?? '').trim().toLowerCase();
  return username.length > 0 ? username : null;
}

export function isAdminPasswordConfigured() {
  return getAdminPassword() !== null && getAdminUsername() !== null;
}

/**
 * Confere usuário e senha em tempo constante (o tempo de resposta não revela o que estava certo).
 * Os dois são sempre comparados, para não dar pista de que só o usuário estava certo.
 */
export function validateAdminCredentials(inputUsername: string, inputPassword: string) {
  const username = getAdminUsername();
  const password = getAdminPassword();
  if (!username || !password) return false;
  const usernameOk = timingSafeEqual(sha256(inputUsername.trim().toLowerCase()), sha256(username));
  const passwordOk = timingSafeEqual(sha256(inputPassword), sha256(password));
  return usernameOk && passwordOk;
}

/** Identifica usuário e senha atuais sem guardá-los: trocar qualquer um dos dois derruba as sessões abertas. */
function passwordFingerprint() {
  return sha256Hex(`igor-bianca-admin:${getAdminUsername() ?? ''}:${getAdminPassword() ?? ''}`).slice(0, 32);
}

let tablesReady: Promise<void> | null = null;

/** Cria as tabelas de sessões e tentativas na primeira vez que forem usadas. */
function ensureAuthTables() {
  tablesReady ??= db
    .query(
      `
        CREATE TABLE IF NOT EXISTS admin_sessions (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          token_hash CHAR(64) NOT NULL UNIQUE,
          password_fingerprint CHAR(32) NOT NULL,
          ip VARCHAR(64),
          user_agent TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL
        );
        CREATE TABLE IF NOT EXISTS admin_login_attempts (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ip VARCHAR(64) NOT NULL,
          success BOOLEAN NOT NULL,
          attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_time ON admin_login_attempts(attempted_at DESC);
      `
    )
    .then(() => undefined)
    .catch((error) => {
      tablesReady = null;
      throw error;
    });
  return tablesReady;
}

/** IP de quem fez a requisição (na Vercel vem em x-real-ip / x-forwarded-for). */
export function getRequestIp(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (request.headers.get('x-real-ip') || forwarded || request.ip || 'desconhecido').slice(0, 64);
}

/** Minutos que faltam para liberar novas tentativas (0 = liberado). */
export async function getLoginLockMinutes(ip: string) {
  await ensureAuthTables();
  const result = await db.query<{ ip_failures: number; total_failures: number; oldest_ip: string | null; oldest_total: string | null }>(
    `
      SELECT
        COUNT(*) FILTER (WHERE ip = $1)::int AS ip_failures,
        COUNT(*)::int AS total_failures,
        MIN(attempted_at) FILTER (WHERE ip = $1) AS oldest_ip,
        MIN(attempted_at) AS oldest_total
      FROM admin_login_attempts
      WHERE success = FALSE AND attempted_at > NOW() - make_interval(mins => $2)
    `,
    [ip, ATTEMPT_WINDOW_MINUTES]
  );
  const row = result.rows[0];
  const blockedSince =
    row.ip_failures >= MAX_FAILURES_PER_IP ? row.oldest_ip : row.total_failures >= MAX_FAILURES_TOTAL ? row.oldest_total : null;
  if (!blockedSince) return 0;
  const unlockAt = new Date(blockedSince).getTime() + ATTEMPT_WINDOW_MINUTES * 60_000;
  return Math.max(1, Math.ceil((unlockAt - Date.now()) / 60_000));
}

/** Registra a tentativa; um login certo zera os erros daquele IP. Também limpa registros antigos. */
export async function recordLoginAttempt(ip: string, success: boolean) {
  await ensureAuthTables();
  await db.query('INSERT INTO admin_login_attempts (ip, success) VALUES ($1, $2)', [ip, success]);
  if (success) {
    await db.query('DELETE FROM admin_login_attempts WHERE ip = $1 AND success = FALSE', [ip]);
  }
  await db.query("DELETE FROM admin_login_attempts WHERE attempted_at < NOW() - INTERVAL '30 days'");
}

/** Abre uma sessão nova e devolve o token que vai no cookie. */
export async function createAdminSession(request: NextRequest) {
  await ensureAuthTables();
  const token = randomBytes(32).toString('base64url');
  await db.query(
    `
      INSERT INTO admin_sessions (token_hash, password_fingerprint, ip, user_agent, expires_at)
      VALUES ($1, $2, $3, $4, NOW() + make_interval(secs => $5))
    `,
    [sha256Hex(token), passwordFingerprint(), getRequestIp(request), request.headers.get('user-agent')?.slice(0, 300) ?? null, SESSION_MAX_AGE_SECONDS]
  );
  await db.query('DELETE FROM admin_sessions WHERE expires_at < NOW()');
  return token;
}

/** Encerra a sessão do cookie atual. */
export async function deleteAdminSession(request: NextRequest) {
  const token = request.cookies.get(ADMIN_AUTH_COOKIE)?.value;
  if (!token) return;
  await ensureAuthTables();
  await db.query('DELETE FROM admin_sessions WHERE token_hash = $1', [sha256Hex(token)]);
}

/**
 * Pedidos que alteram dados precisam vir do próprio site (o navegador sempre manda Origin nesses casos).
 * Impede que outra página use o login aberto do admin para disparar ações.
 */
function isSameOrigin(request: NextRequest) {
  if (request.method === 'GET' || request.method === 'HEAD') return true;
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}

export async function isAdminRequestAuthorized(request: NextRequest) {
  const token = request.cookies.get(ADMIN_AUTH_COOKIE)?.value;
  if (!token || !isAdminPasswordConfigured() || !isSameOrigin(request)) {
    return false;
  }

  try {
    await ensureAuthTables();
    const result = await db.query<{ id: string; seconds_since_touch: number }>(
      `
        SELECT id::text, EXTRACT(EPOCH FROM (NOW() - last_seen_at))::int AS seconds_since_touch
        FROM admin_sessions
        WHERE token_hash = $1
          AND password_fingerprint = $2
          AND expires_at > NOW()
          AND last_seen_at > NOW() - make_interval(secs => $3)
      `,
      [sha256Hex(token), passwordFingerprint(), SESSION_IDLE_SECONDS]
    );
    const session = result.rows[0];
    if (!session) return false;

    if (session.seconds_since_touch > SESSION_TOUCH_SECONDS) {
      await db.query('UPDATE admin_sessions SET last_seen_at = NOW() WHERE id = $1', [session.id]);
    }
    return true;
  } catch (error) {
    console.error('Falha ao validar sessao admin', error);
    return false;
  }
}
