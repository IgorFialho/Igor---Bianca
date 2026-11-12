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
/**
 * Confere (com uma consulta leve, sem travar tabelas) se as tabelas/colunas mais recentes do mural já existem.
 * Em pico de acesso a Vercel liga vários servidores novos; sem esta checagem, cada um rodaria os ALTER TABLE
 * abaixo, que travam a tabela por um instante mesmo quando não há nada a mudar.
 * Ao criar uma tabela/coluna nova no script, acrescente-a aqui também.
 */
async function muralSchemaIsReady() {
  const result = await db.query<{ ok: boolean }>(`
    SELECT
      to_regclass('public.mural_comment_likes') IS NOT NULL
      AND to_regclass('public.mural_post_media') IS NOT NULL
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'mural_posts' AND column_name = 'card_focus')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'mural_comments' AND column_name = 'author_role')
      AS ok
  `);
  return Boolean(result.rows[0]?.ok);
}

export function ensureMuralSchema() {
  ready ??= muralSchemaIsReady()
    .then((isReady) => (isReady ? undefined : createMuralSchema()))
    .catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}

function createMuralSchema() {
  return db
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

        -- Recorte do vídeo feito no editor ("x,y,w,h" em frações), aplicado pelo Cloudinary.
        ALTER TABLE mural_posts ADD COLUMN IF NOT EXISTS media_crop VARCHAR(40);

        -- Parte da mídia que aparece no card quando ele corta a foto (0 = topo/esquerda, 0.5 = centro, 1 = base/direita).
        ALTER TABLE mural_posts ADD COLUMN IF NOT EXISTS card_focus REAL;

        -- Carrossel: fotos/vídeos a mais de um post (a 1ª mídia continua nas colunas do próprio post).
        CREATE TABLE IF NOT EXISTS mural_post_media (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          post_id BIGINT NOT NULL REFERENCES mural_posts(id) ON DELETE CASCADE,
          position SMALLINT NOT NULL,
          media_type VARCHAR(10) NOT NULL CHECK (media_type IN ('image', 'video')),
          public_id VARCHAR(255) NOT NULL UNIQUE,
          width INTEGER,
          height INTEGER,
          duration NUMERIC(8, 2),
          media_crop VARCHAR(40),
          card_focus REAL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_mural_post_media_post ON mural_post_media(post_id, position);

        -- Curtidas nos comentários (uma por aparelho); os mais curtidos aparecem primeiro.
        CREATE TABLE IF NOT EXISTS mural_comment_likes (
          comment_id BIGINT NOT NULL REFERENCES mural_comments(id) ON DELETE CASCADE,
          invite_code VARCHAR(80) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (comment_id, invite_code)
        );

        -- Comentário feito pelo noivo ou pela noiva (logados no painel): aparece em destaque.
        ALTER TABLE mural_comments ADD COLUMN IF NOT EXISTS author_role VARCHAR(10);
      `
    )
    .then(() => undefined);
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
  /** Parte da mídia que aparece no card quando ele corta (0 a 1; 0.5 = centro). */
  cardFocus: number;
  /** Todas as mídias do post, na ordem (a 1ª é a do próprio post); mais de uma = carrossel. */
  media: MuralMediaItem[];
  likedByMe: boolean;
  isMine: boolean;
  isHidden: boolean;
  /** Segundos que ainda faltam para o autor poder apagar (0 = não pode mais / não é dele). */
  deleteSecondsLeft: number;
};

/** Uma foto/vídeo de um post (carrossel). */
export type MuralMediaItem = {
  mediaType: MediaKind;
  thumbUrl: string;
  fullUrl: string;
  posterUrl: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  cardFocus: number;
};

/** Máximo de fotos/vídeos num post (como o carrossel do Instagram). */
export const MAX_MEDIA_PER_POST = 10;

type ExtraMediaRow = {
  post_id: string;
  media_type: MediaKind;
  public_id: string;
  width: number | null;
  height: number | null;
  duration: string | null;
  media_crop: string | null;
  card_focus: number | null;
};

/** Mídias a mais (carrossel) de vários posts, agrupadas por post e na ordem. */
async function extraMediaByPost(postIds: string[]) {
  const byPost = new Map<string, MuralMediaItem[]>();
  if (!postIds.length) return byPost;
  const result = await db.query<ExtraMediaRow>(
    `SELECT post_id::text, media_type, public_id, width, height, duration::text, media_crop, card_focus
     FROM mural_post_media WHERE post_id::text = ANY($1::text[]) ORDER BY post_id, position`,
    [postIds]
  );
  for (const row of result.rows) {
    const urls = mediaUrls(row.media_type, row.public_id, row.media_crop);
    const list = byPost.get(row.post_id) ?? [];
    list.push({
      mediaType: row.media_type,
      thumbUrl: urls.thumb,
      fullUrl: urls.full,
      posterUrl: urls.poster,
      width: row.width,
      height: row.height,
      duration: row.duration ? Number(row.duration) : null,
      cardFocus: readCardFocus(row.card_focus),
    });
    byPost.set(row.post_id, list);
  }
  return byPost;
}

/** Arquivos (Cloudinary) das mídias a mais de um post, para apagar junto com ele. */
export async function listExtraMediaFiles(postId: string) {
  const result = await db.query<{ public_id: string; media_type: MediaKind }>(
    'SELECT public_id, media_type FROM mural_post_media WHERE post_id::text = $1',
    [postId]
  );
  return result.rows;
}

/** Id de post vindo da URL/corpo: só dígitos (senão, ignora). */
function toBigintParam(value: string | null | undefined) {
  return typeof value === 'string' && /^\d{1,18}$/.test(value) ? value : null;
}

/**
 * "Pulso" do mural: um resumo minúsculo que muda sempre que algo muda (post novo/oculto, curtida, comentário).
 * Os celulares consultam só isto a cada poucos segundos e baixam as novidades apenas quando ele muda.
 */
export async function getMuralPulse() {
  await ensureMuralSchema();
  const result = await db.query<{ posts: number; max_id: string; likes: number; comments: number; comment_likes: number; media: number }>(
    `
      SELECT
        (SELECT COUNT(*)::int FROM mural_posts WHERE is_hidden = FALSE) AS posts,
        (SELECT COALESCE(MAX(id), 0)::text FROM mural_posts) AS max_id,
        (SELECT COUNT(*)::int FROM mural_likes) AS likes,
        (SELECT COUNT(*)::int FROM mural_comments WHERE is_hidden = FALSE) AS comments,
        (SELECT COUNT(*)::int FROM mural_comment_likes) AS comment_likes,
        (SELECT COUNT(*)::int FROM mural_post_media) AS media
    `
  );
  const row = result.rows[0];
  return row ? [row.posts, row.max_id, row.likes, row.comments, row.comment_likes, row.media].join('.') : '0';
}

/** Posição da parte que aparece no card (0 a 1); vazio ou inválido = centro. */
export function readCardFocus(value: unknown) {
  const number = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(number)) return 0.5;
  return Math.min(1, Math.max(0, Math.round(number * 1000) / 1000));
}

type PostRow = {
  id: string;
  invite_code: string;
  author_name: string;
  author_role: string | null;
  media_crop: string | null;
  card_focus: number | null;
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
/**
 * Posts do mural, mais novos primeiro. Convidados não veem os ocultos; o admin vê tudo.
 * Páginas: beforeId (posts mais antigos que ele), afterId (só os mais novos que ele) ou ids (posts específicos).
 */
export async function listPosts({
  viewerCode,
  includeHidden = false,
  limit = 400,
  beforeId = null,
  afterId = null,
  ids = null,
}: {
  viewerCode?: string | null;
  includeHidden?: boolean;
  limit?: number;
  beforeId?: string | null;
  afterId?: string | null;
  ids?: string[] | null;
}) {
  await ensureMuralSchema();
  const result = await db.query<PostRow>(
    `
      SELECT p.id::text, p.invite_code, p.author_name, p.author_role, p.media_crop, p.card_focus, p.caption, p.media_type, p.public_id, p.width, p.height,
        p.duration::text, p.is_hidden, p.created_at,
        (SELECT COUNT(*)::int FROM mural_likes l WHERE l.post_id = p.id) AS likes,
        (SELECT COUNT(*)::int FROM mural_comments c WHERE c.post_id = p.id AND (c.is_hidden = FALSE OR $2)) AS comments,
        EXISTS (SELECT 1 FROM mural_likes l WHERE l.post_id = p.id AND UPPER(l.invite_code) = UPPER(COALESCE($1, ''))) AS liked_by_me,
        EXTRACT(EPOCH FROM (NOW() - p.created_at))::int AS seconds_since
      FROM mural_posts p
      WHERE (p.is_hidden = FALSE OR $2)
        AND ($4::bigint IS NULL OR p.id < $4::bigint)
        AND ($5::bigint IS NULL OR p.id > $5::bigint)
        AND ($6::text[] IS NULL OR p.id::text = ANY($6::text[]))
      ORDER BY p.id DESC
      LIMIT $3
    `,
    [viewerCode ?? null, includeHidden, limit, toBigintParam(beforeId), toBigintParam(afterId), ids && ids.length ? ids.slice(0, 200) : null]
  );
  const extras = await extraMediaByPost(result.rows.map((row) => row.id));
  return result.rows.map((row: PostRow): MuralPost => {
    const urls = mediaUrls(row.media_type, row.public_id, row.media_crop);
    const first: MuralMediaItem = {
      mediaType: row.media_type,
      thumbUrl: urls.thumb,
      fullUrl: urls.full,
      posterUrl: urls.poster,
      width: row.width,
      height: row.height,
      duration: row.duration ? Number(row.duration) : null,
      cardFocus: readCardFocus(row.card_focus),
    };
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
      cardFocus: readCardFocus(row.card_focus),
      media: [first, ...(extras.get(row.id) ?? [])],
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
  /** Comentário do noivo/noiva (em destaque) ou null para convidados. */
  authorRole: MuralAuthorRole;
  text: string;
  createdAt: string;
  isMine: boolean;
  isHidden: boolean;
  /** Segundos que ainda faltam para o autor poder apagar (0 = não pode mais / não é dele). */
  deleteSecondsLeft: number;
  /** Curtidas do comentário e se este aparelho curtiu. */
  likes: number;
  likedByMe: boolean;
};

export async function listComments(postId: string, { viewerCode, includeHidden = false }: { viewerCode?: string | null; includeHidden?: boolean }) {
  await ensureMuralSchema();
  const result = await db.query<{
    id: string;
    post_id: string;
    invite_code: string;
    author_name: string;
    author_role: string | null;
    text: string;
    is_hidden: boolean;
    created_at: string;
    seconds_since: number;
    likes: number;
    liked_by_me: boolean;
  }>(
    `
      SELECT c.id::text, c.post_id::text, c.invite_code, c.author_name, c.author_role, c.text, c.is_hidden, c.created_at,
        EXTRACT(EPOCH FROM (NOW() - c.created_at))::int AS seconds_since,
        (SELECT COUNT(*)::int FROM mural_comment_likes l WHERE l.comment_id = c.id) AS likes,
        EXISTS (SELECT 1 FROM mural_comment_likes l WHERE l.comment_id = c.id AND l.invite_code = COALESCE($3, '')) AS liked_by_me
      FROM mural_comments c
      WHERE c.post_id::text = $1 AND (c.is_hidden = FALSE OR $2)
      -- Mais curtidos primeiro; empate: na ordem em que foram escritos.
      ORDER BY likes DESC, c.created_at ASC
      LIMIT 500
    `,
    [postId, includeHidden, viewerCode ?? null]
  );
  return result.rows.map((row): MuralComment => {
    const isMine = Boolean(viewerCode) && row.invite_code.toUpperCase() === String(viewerCode).toUpperCase();
    return {
      id: row.id,
      postId: row.post_id,
      authorName: row.author_name,
      authorRole: row.author_role === 'noivo' || row.author_role === 'noiva' ? row.author_role : null,
      text: row.text,
      createdAt: new Date(row.created_at).toISOString(),
      isMine,
      isHidden: row.is_hidden,
      deleteSecondsLeft: isMine ? Math.max(0, COMMENT_DELETE_WINDOW_SECONDS - row.seconds_since) : 0,
      likes: row.likes,
      likedByMe: row.liked_by_me,
    };
  });
}

/** Texto limpo e no tamanho certo (conta emoji como 1). */
export function cleanText(value: unknown, max: number) {
  if (typeof value !== 'string') return '';
  return Array.from(value.replace(/\s+/g, ' ').trim()).slice(0, max).join('');
}
