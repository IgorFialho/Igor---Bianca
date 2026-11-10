import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';

// Autenticação do painel /admin.
// - Cada login cria uma sessão própria: o cookie leva um token aleatório e o banco guarda só o hash dele.
//   "Sair" apaga a sessão no banco, então um cookie copiado deixa de valer.
// - A sessão expira em 8 horas, ou após 2 horas sem uso.
// - Dois administradores com acesso total: o noivo (usuário "igor", senha ADMIN_IGOR_PASSWORD) e a noiva
//   (usuário "bianca", senha ADMIN_BIANCA_PASSWORD). Trocar a senha de um na Vercel derruba só as sessões dele.
// - Tentativas erradas são limitadas por IP e no total (contra força bruta).

export const ADMIN_AUTH_COOKIE = 'igor_bianca_admin_session';

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const SESSION_IDLE_SECONDS = 60 * 60 * 2;
// Atualiza "último uso" no máximo a cada 5 minutos, para não escrever no banco a cada clique.
const SESSION_TOUCH_SECONDS = 60 * 5;

// Limites de tentativas erradas: ao atingir o limite, o login fica bloqueado por 5 minutos.
const ATTEMPT_WINDOW_MINUTES = 5;
const MAX_FAILURES_PER_IP = 5;
const MAX_FAILURES_TOTAL = 30;

const MIN_PASSWORD_LENGTH = 12;

const sha256 = (value: string) => createHash('sha256').update(value).digest();
const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

export type AdminRole = 'noivo' | 'noiva';
export type AdminUser = { role: AdminRole; username: string; name: string };
type AdminAccount = AdminUser & { passwordEnv: string };

const ADMIN_USERS: AdminAccount[] = [
  { role: 'noivo', username: 'igor', name: 'Igor', passwordEnv: 'ADMIN_IGOR_PASSWORD' },
  { role: 'noiva', username: 'bianca', name: 'Bianca', passwordEnv: 'ADMIN_BIANCA_PASSWORD' },
];

/** Senha de um administrador na Vercel/.env.local; sem senha (ou curta demais) esse usuário não entra. */
function getPassword(user: AdminAccount) {
  const password = process.env[user.passwordEnv] ?? '';
  return password.length >= MIN_PASSWORD_LENGTH ? password : null;
}

const publicUser = ({ role, username, name }: AdminUser): AdminUser => ({ role, username, name });

/** Pelo menos um dos dois administradores tem senha configurada. */
export function isAdminPasswordConfigured() {
  return ADMIN_USERS.some((user) => getPassword(user) !== null);
}

/**
 * Confere usuário e senha em tempo constante (o tempo de resposta não revela o que estava certo).
 * Compara sempre com os dois administradores, para não dar pista de qual usuário existe.
 */
export function validateAdminCredentials(inputUsername: string, inputPassword: string): AdminUser | null {
  const typedUser = sha256(inputUsername.trim().toLowerCase());
  const typedPassword = sha256(inputPassword);
  let match: AdminUser | null = null;
  for (const user of ADMIN_USERS) {
    const password = getPassword(user);
    const usernameOk = timingSafeEqual(typedUser, sha256(user.username));
    // Sem senha configurada, compara com um valor aleatório (nunca confere), mantendo o mesmo tempo.
    const passwordOk = timingSafeEqual(typedPassword, sha256(password ?? randomBytes(16).toString('hex')));
    if (password && usernameOk && passwordOk) match = publicUser(user);
  }
  return match;
}

/** Identifica usuário e senha sem guardá-los: trocar a senha de alguém derruba as sessões abertas dele. */
function passwordFingerprint(user: AdminAccount) {
  return sha256Hex(`igor-bianca-admin:${user.username}:${getPassword(user) ?? ''}`).slice(0, 32);
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
        ALTER TABLE admin_sessions ADD COLUMN IF NOT EXISTS admin_role VARCHAR(10);
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

/** Abre uma sessão nova de quem entrou (noivo ou noiva) e devolve o token que vai no cookie. */
export async function createAdminSession(request: NextRequest, admin: AdminUser) {
  await ensureAuthTables();
  const user = ADMIN_USERS.find((item) => item.role === admin.role);
  if (!user) throw new Error('Administrador desconhecido.');
  const token = randomBytes(32).toString('base64url');
  await db.query(
    `
      INSERT INTO admin_sessions (token_hash, password_fingerprint, admin_role, ip, user_agent, expires_at)
      VALUES ($1, $2, $3, $4, $5, NOW() + make_interval(secs => $6))
    `,
    [
      sha256Hex(token),
      passwordFingerprint(user),
      user.role,
      getRequestIp(request),
      request.headers.get('user-agent')?.slice(0, 300) ?? null,
      SESSION_MAX_AGE_SECONDS,
    ]
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

/**
 * Quem está logado no painel (noivo ou noiva), ou null. Sessões do login único antigo (sem usuário) e sessões
 * de quem trocou a senha deixam de valer.
 */
export async function getAdminSession(request: NextRequest): Promise<AdminUser | null> {
  const token = request.cookies.get(ADMIN_AUTH_COOKIE)?.value;
  if (!token || !isAdminPasswordConfigured() || !isSameOrigin(request)) {
    return null;
  }

  try {
    await ensureAuthTables();
    const result = await db.query<{ id: string; admin_role: string | null; password_fingerprint: string; seconds_since_touch: number }>(
      `
        SELECT id::text, admin_role, password_fingerprint, EXTRACT(EPOCH FROM (NOW() - last_seen_at))::int AS seconds_since_touch
        FROM admin_sessions
        WHERE token_hash = $1
          AND expires_at > NOW()
          AND last_seen_at > NOW() - make_interval(secs => $2)
      `,
      [sha256Hex(token), SESSION_IDLE_SECONDS]
    );
    const session = result.rows[0];
    const user = session ? ADMIN_USERS.find((item) => item.role === session.admin_role) : undefined;
    if (!session || !user || !getPassword(user) || session.password_fingerprint.trim() !== passwordFingerprint(user)) return null;

    if (session.seconds_since_touch > SESSION_TOUCH_SECONDS) {
      await db.query('UPDATE admin_sessions SET last_seen_at = NOW() WHERE id = $1', [session.id]);
    }
    return publicUser(user);
  } catch (error) {
    console.error('Falha ao validar sessao admin', error);
    return null;
  }
}

export async function isAdminRequestAuthorized(request: NextRequest) {
  return (await getAdminSession(request)) !== null;
}
