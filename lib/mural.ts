import { db } from '@/lib/db';
import { mediaUrls, type MediaKind } from '@/lib/cloudinary';

// Mural do casamento: convidados postam fotos/vídeos (arquivos no Cloudinary; posts, curtidas e comentários aqui).

export const CAPTION_MAX_LENGTH = 300;
export const COMMENT_MAX_LENGTH = 300;
// Limite por convite, para evitar abuso (por dia).
export const MAX_POSTS_PER_DAY = 40;
// Quem publicou/comentou pode apagar só logo depois; passado o prazo, só o admin apaga.
export const POST_DELETE_WINDOW_SECONDS = 2 * 60;
export const COMMENT_DELETE_WINDOW_SECONDS = 5 * 60;

let ready: Promise<void> | null = null;

/** Cria as tabelas do mural na primeira vez que forem usadas. */
export function ensureMuralSchema() {
  ready ??= db
    .query(
      `
        CREATE TABLE IF NOT EXISTS mural_settings (
          id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
          is_open BOOLEAN NOT NULL DEFAULT FALSE,
          opens_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        INSERT INTO mural_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

        CREATE TABLE IF NOT EXISTS mural_posts (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          invitation_code_id BIGINT REFERENCES invitation_codes(id) ON DELETE SET NULL,
          invite_code VARCHAR(80) NOT NULL,
          author_name VARCHAR(200) NOT NULL,
          caption VARCHAR(${CAPTION_MAX_LENGTH}),
          media_type VARCHAR(10) NOT NULL CHECK (media_type IN ('image', 'video')),
          public_id TEXT NOT NULL UNIQUE,
          width INTEGER,
          height INTEGER,
          duration NUMERIC,
          is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_mural_posts_created ON mural_posts(created_at DESC);

        CREATE TABLE IF NOT EXISTS mural_likes (
          post_id BIGINT NOT NULL REFERENCES mural_posts(id) ON DELETE CASCADE,
          invite_code VARCHAR(80) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (post_id, invite_code)
        );

        CREATE TABLE IF NOT EXISTS mural_comments (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          post_id BIGINT NOT NULL REFERENCES mural_posts(id) ON DELETE CASCADE,
          invite_code VARCHAR(80) NOT NULL,
          author_name VARCHAR(200) NOT NULL,
          text VARCHAR(${COMMENT_MAX_LENGTH}) NOT NULL,
          is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_mural_comments_post ON mural_comments(post_id, created_at);

        -- Mural aberto: rede (IP) de quem publicou, para limitar abuso.
        ALTER TABLE mural_posts ADD COLUMN IF NOT EXISTS ip VARCHAR(64);

        -- Horário agendado para o mural fechar sozinho.
        ALTER TABLE mural_settings ADD COLUMN IF NOT EXISTS closes_at TIMESTAMPTZ;

        -- Post feito pelo noivo ou pela noiva (logados no painel): aparece em destaque.
        ALTER TABLE mural_posts ADD COLUMN IF NOT EXISTS author_role VARCHAR(10);
      `
    )
    .then(() => undefined)
    .catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}

export type MuralSettings = {
  /** Postagem liberada agora: aberto (pelo botão ou pelo horário agendado) e ainda antes do horário de fechar. */
  isOpen: boolean;
  /** Aberto pelo botão do admin. */
  manualOpen: boolean;
  /** Horário agendado para abrir sozinho (ISO), se houver. */
  opensAt: string | null;
  /** Horário agendado para fechar sozinho (ISO), se houver. */
  closesAt: string | null;
  /** Já passou do horário de fechar (o mural foi encerrado). */
  isClosedBySchedule: boolean;
};

export async function getMuralSettings(): Promise<MuralSettings> {
  await ensureMuralSchema();
  const result = await db.query<{ is_open: boolean; opens_at: string | null; closes_at: string | null; open_now: boolean; closed_by_schedule: boolean }>(
    `
      SELECT is_open, opens_at, closes_at,
        (is_open OR (opens_at IS NOT NULL AND opens_at <= NOW()))
          AND NOT (closes_at IS NOT NULL AND closes_at <= NOW()) AS open_now,
        (closes_at IS NOT NULL AND closes_at <= NOW()) AS closed_by_schedule
      FROM mural_settings WHERE id = 1
    `
  );
  const row = result.rows[0];
  return {
    isOpen: Boolean(row?.open_now),
    manualOpen: Boolean(row?.is_open),
    opensAt: row?.opens_at ? new Date(row.opens_at).toISOString() : null,
    closesAt: row?.closes_at ? new Date(row.closes_at).toISOString() : null,
    isClosedBySchedule: Boolean(row?.closed_by_schedule),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Mural aberto: qualquer pessoa vê e publica. Quem publica informa o nome; o aparelho tem um identificador
// aleatório (guardado só nele) que serve para curtir uma vez, apagar os próprios posts e marcar "meus posts".

export const AUTHOR_NAME_MAX_LENGTH = 60;
// Limite por rede (IP), além do limite por aparelho: evita abuso por quem tiver o link.
export const MAX_POSTS_PER_IP_PER_HOUR = 60;

/** Identificador do aparelho enviado pelo navegador (aleatório; letras, números e hífen). */
export function readViewerId(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(value) ? value : null;
}

/** Nome informado por quem publica/comenta (2 a 60 caracteres). */
export function readAuthorName(value: unknown) {
  const name = cleanText(value, AUTHOR_NAME_MAX_LENGTH);
  return name.length >= 2 ? name : null;
}

export function requestIp(headers: Headers) {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (headers.get('x-real-ip') || forwarded || 'desconhecido').slice(0, 64);
}

export type MuralGuest = { id: string; code: string; name: string };

/**
 * Identifica o convidado pelo código do convite. O nome exibido é o digitado no RSVP (se confirmou);
 * senão, o nome cadastrado no convite. Casal aparece como "Fulano e Fulana".
 */
export async function resolveGuest(rawCode: unknown): Promise<MuralGuest | null> {
  const code = typeof rawCode === 'string' ? rawCode.trim() : '';
  if (!code || code.length > 80) return null;
  const result = await db.query<{ id: string; code: string; guest_name: string | null; responder: string | null }>(
    `
      SELECT i.id::text, i.code, i.guest_name,
        (
          SELECT r.responder_full_name FROM rsvp_responses r
          WHERE UPPER(r.invite_code_used) = UPPER(i.code) AND r.attendance = 'yes'
          ORDER BY r.submitted_at DESC LIMIT 1
        ) AS responder
      FROM invitation_codes i
      WHERE UPPER(i.code) = UPPER($1) AND i.is_active = TRUE
      LIMIT 1
    `,
    [code]
  );
  const row = result.rows[0];
  if (!row) return null;
  const names = (row.responder || row.guest_name || 'Convidado')
    .split('|')
    .map((name) => name.trim())
    .filter(Boolean);
  return { id: row.id, code: row.code, name: names.join(' e ') || 'Convidado' };
}

/** Post do noivo/noiva (em destaque) ou null para convidados. */
export type MuralAuthorRole = 'noivo' | 'noiva' | null;

export type MuralPost = {
  id: string;
  authorName: string;
  authorRole: MuralAuthorRole;
  caption: string | null;
  mediaType: MediaKind;
  thumbUrl: string;
  fullUrl: string;
  posterUrl: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  createdAt: string;
  likes: number;
  comments: number;
  likedByMe: boolean;
  isMine: boolean;
  isHidden: boolean;
  /** Segundos que ainda faltam para o autor poder apagar (0 = não pode mais / não é dele). */
  deleteSecondsLeft: number;
};

type PostRow = {
  id: string;
  invite_code: string;
  author_name: string;
  author_role: string | null;
  caption: string | null;
  media_type: MediaKind;
  public_id: string;
  width: number | null;
  height: number | null;
  duration: string | null;
  is_hidden: boolean;
  created_at: string;
  likes: number;
  comments: number;
  liked_by_me: boolean;
  seconds_since: number;
};

/** Posts do mural, mais novos primeiro. Convidados não veem os ocultos; o admin vê tudo. */
export async function listPosts({ viewerCode, includeHidden = false, limit = 400 }: { viewerCode?: string | null; includeHidden?: boolean; limit?: number }) {
  await ensureMuralSchema();
  const result = await db.query<PostRow>(
    `
      SELECT p.id::text, p.invite_code, p.author_name, p.author_role, p.caption, p.media_type, p.public_id, p.width, p.height,
        p.duration::text, p.is_hidden, p.created_at,
        (SELECT COUNT(*)::int FROM mural_likes l WHERE l.post_id = p.id) AS likes,
        (SELECT COUNT(*)::int FROM mural_comments c WHERE c.post_id = p.id AND (c.is_hidden = FALSE OR $2)) AS comments,
        EXISTS (SELECT 1 FROM mural_likes l WHERE l.post_id = p.id AND UPPER(l.invite_code) = UPPER(COALESCE($1, ''))) AS liked_by_me,
        EXTRACT(EPOCH FROM (NOW() - p.created_at))::int AS seconds_since
      FROM mural_posts p
      WHERE p.is_hidden = FALSE OR $2
      ORDER BY p.created_at DESC
      LIMIT $3
    `,
    [viewerCode ?? null, includeHidden, limit]
  );
  return result.rows.map((row: PostRow): MuralPost => {
    const urls = mediaUrls(row.media_type, row.public_id);
    const isMine = Boolean(viewerCode) && row.invite_code.toUpperCase() === String(viewerCode).toUpperCase();
    return {
      id: row.id,
      authorName: row.author_name,
      authorRole: row.author_role === 'noivo' || row.author_role === 'noiva' ? row.author_role : null,
      caption: row.caption,
      mediaType: row.media_type,
      thumbUrl: urls.thumb,
      fullUrl: urls.full,
      posterUrl: urls.poster,
      width: row.width,
      height: row.height,
      duration: row.duration ? Number(row.duration) : null,
      createdAt: new Date(row.created_at).toISOString(),
      likes: row.likes,
      comments: row.comments,
      likedByMe: row.liked_by_me,
      isMine,
      isHidden: row.is_hidden,
      deleteSecondsLeft: isMine ? Math.max(0, POST_DELETE_WINDOW_SECONDS - row.seconds_since) : 0,
    };
  });
}

export type MuralComment = {
  id: string;
  postId: string;
  authorName: string;
  text: string;
  createdAt: string;
  isMine: boolean;
  isHidden: boolean;
  /** Segundos que ainda faltam para o autor poder apagar (0 = não pode mais / não é dele). */
  deleteSecondsLeft: number;
};

export async function listComments(postId: string, { viewerCode, includeHidden = false }: { viewerCode?: string | null; includeHidden?: boolean }) {
  await ensureMuralSchema();
  const result = await db.query<{ id: string; post_id: string; invite_code: string; author_name: string; text: string; is_hidden: boolean; created_at: string; seconds_since: number }>(
    `
      SELECT id::text, post_id::text, invite_code, author_name, text, is_hidden, created_at,
        EXTRACT(EPOCH FROM (NOW() - created_at))::int AS seconds_since
      FROM mural_comments
      WHERE post_id::text = $1 AND (is_hidden = FALSE OR $2)
      ORDER BY created_at ASC
      LIMIT 500
    `,
    [postId, includeHidden]
  );
  return result.rows.map((row): MuralComment => {
    const isMine = Boolean(viewerCode) && row.invite_code.toUpperCase() === String(viewerCode).toUpperCase();
    return {
      id: row.id,
      postId: row.post_id,
      authorName: row.author_name,
      text: row.text,
      createdAt: new Date(row.created_at).toISOString(),
      isMine,
      isHidden: row.is_hidden,
      deleteSecondsLeft: isMine ? Math.max(0, COMMENT_DELETE_WINDOW_SECONDS - row.seconds_since) : 0,
    };
  });
}

/** Texto limpo e no tamanho certo (conta emoji como 1). */
export function cleanText(value: unknown, max: number) {
  if (typeof value !== 'string') return '';
  return Array.from(value.replace(/\s+/g, ' ').trim()).slice(0, max).join('');
}
