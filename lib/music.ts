import { db } from '@/lib/db';
import { musicUrl } from '@/lib/cloudinary';

// Músicas do site: biblioteca (arquivos no Cloudinary) e qual música toca em cada página.
// - modo "single": a mesma música em todo o site, contínua entre as páginas;
// - modo "per_page": cada página escolhe uma música ou nenhuma. Páginas com a mesma música continuam de onde estavam.

/** Música que já vem com o site (public/sons): fica sempre disponível e não pode ser excluída. */
export const DEFAULT_TRACK_ID = 'padrao';
export const DEFAULT_TRACK = { id: DEFAULT_TRACK_ID, title: 'Música original do site', url: '/sons/musica-fundo.mp3', builtIn: true };
/** Autoria (artista/intérprete, compositor, licença…): aparece no player, por cuidado com o direito de uso. */
export const TRACK_ARTIST_MAX_LENGTH = 120;
/** Maior ponto de início aceito (segundos). */
export const TRACK_START_MAX = 3600;

/** Volume com que cada música começa no player do site, em % (o convidado pode mudar depois). Padrão: 25%. */
export const TRACK_VOLUME_MIN = 5;
export const TRACK_VOLUME_MAX = 100;
export const TRACK_VOLUME_DEFAULT = 25;

/** Volume válido em % (25 quando vazio ou inválido). */
export function readTrackVolume(value: unknown) {
  const number = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(number)) return TRACK_VOLUME_DEFAULT;
  return Math.min(TRACK_VOLUME_MAX, Math.max(TRACK_VOLUME_MIN, Math.round(number)));
}

/** Ponto de início válido em segundos (0 quando vazio ou inválido). */
export function readTrackStart(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(TRACK_START_MAX, Math.round(number * 10) / 10);
}

/** Páginas que podem ter música própria (o /rsvp faz parte do convite).
 *  A home fica em /home; a chave continua "login" (nome antigo da rota) porque é a que está salva no banco. */
export const MUSIC_PAGES = [
  { key: 'login', label: 'Página principal', path: '/home' },
  { key: 'convite', label: 'Convite e confirmação de presença', path: '/convite' },
  { key: 'presentes', label: 'Lista de presentes', path: '/presentes' },
  { key: 'mural', label: 'Mural', path: '/mural' },
] as const;
export type MusicPageKey = (typeof MUSIC_PAGES)[number]['key'];
export const MUSIC_PAGE_KEYS = MUSIC_PAGES.map((page) => page.key) as MusicPageKey[];

export type MusicMode = 'single' | 'per_page';
/** start: segundo em que a música começa (e para onde volta ao repetir); volume: % com que ela começa no player. */
export type MusicTrack = {
  id: string;
  title: string;
  artist: string | null;
  url: string;
  builtIn: boolean;
  duration: number | null;
  start: number;
  volume: number;
};
/** Por página: id da música ou null ("sem música"). */
export type MusicSettings = { mode: MusicMode; singleTrack: string; pageTracks: Record<MusicPageKey, string | null> };

export const TRACK_TITLE_MAX_LENGTH = 80;

let ready: Promise<void> | null = null;

/** Cria as tabelas de músicas na primeira vez que forem usadas. */
export function ensureMusicSchema() {
  ready ??= db
    .query(
      `
        CREATE TABLE IF NOT EXISTS music_tracks (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          title VARCHAR(${TRACK_TITLE_MAX_LENGTH}) NOT NULL,
          public_id VARCHAR(255) NOT NULL UNIQUE,
          duration NUMERIC(8, 2),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS music_settings (
          id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
          mode VARCHAR(10) NOT NULL DEFAULT 'single',
          single_track VARCHAR(40) NOT NULL DEFAULT '${DEFAULT_TRACK_ID}',
          page_tracks JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        INSERT INTO music_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

        -- Autoria das músicas (inclusive da original do site, que não fica na tabela de músicas).
        ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS artist VARCHAR(${TRACK_ARTIST_MAX_LENGTH});
        ALTER TABLE music_settings ADD COLUMN IF NOT EXISTS default_title VARCHAR(${TRACK_TITLE_MAX_LENGTH});
        ALTER TABLE music_settings ADD COLUMN IF NOT EXISTS default_artist VARCHAR(${TRACK_ARTIST_MAX_LENGTH});

        -- A partir de que segundo cada música toca (e para onde volta ao repetir).
        ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS start_at NUMERIC(7, 1) NOT NULL DEFAULT 0;
        ALTER TABLE music_settings ADD COLUMN IF NOT EXISTS default_start NUMERIC(7, 1) NOT NULL DEFAULT 0;

        -- Volume com que cada música começa no player do site (%). Na criação, aproveita o valor já salvo na
        -- primeira versão (volume_pct/default_volume, que eram "% sobre o volume do convidado", 100 = normal):
        -- valores abaixo de 100 viram o volume do player; o resto começa no padrão (${TRACK_VOLUME_DEFAULT}%).
        ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS volume_pct SMALLINT NOT NULL DEFAULT 100;
        ALTER TABLE music_settings ADD COLUMN IF NOT EXISTS default_volume SMALLINT NOT NULL DEFAULT 100;
        ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS player_volume SMALLINT;
        ALTER TABLE music_settings ADD COLUMN IF NOT EXISTS default_player_volume SMALLINT;
        UPDATE music_tracks SET player_volume = CASE WHEN volume_pct BETWEEN ${TRACK_VOLUME_MIN} AND 99 THEN volume_pct ELSE ${TRACK_VOLUME_DEFAULT} END
          WHERE player_volume IS NULL;
        UPDATE music_settings SET default_player_volume = CASE WHEN default_volume BETWEEN ${TRACK_VOLUME_MIN} AND 99 THEN default_volume ELSE ${TRACK_VOLUME_DEFAULT} END
          WHERE default_player_volume IS NULL;
        ALTER TABLE music_tracks ALTER COLUMN player_volume SET DEFAULT ${TRACK_VOLUME_DEFAULT};
        ALTER TABLE music_settings ALTER COLUMN default_player_volume SET DEFAULT ${TRACK_VOLUME_DEFAULT};
      `
    )
    .then(() => undefined)
    .catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}

export async function listTracks(): Promise<MusicTrack[]> {
  await ensureMusicSchema();
  const [result, defaults] = await Promise.all([
    db.query<{
      id: string;
      title: string;
      artist: string | null;
      public_id: string;
      duration: string | null;
      start_at: string | null;
      player_volume: number | null;
    }>('SELECT id::text, title, artist, public_id, duration::text, start_at::text, player_volume FROM music_tracks ORDER BY created_at ASC'),
    db.query<{ default_title: string | null; default_artist: string | null; default_start: string | null; default_player_volume: number | null }>(
      'SELECT default_title, default_artist, default_start::text, default_player_volume FROM music_settings WHERE id = 1'
    ),
  ]);
  const original = defaults.rows[0];
  return [
    {
      ...DEFAULT_TRACK,
      title: original?.default_title || DEFAULT_TRACK.title,
      artist: original?.default_artist || null,
      duration: null,
      start: readTrackStart(original?.default_start),
      volume: readTrackVolume(original?.default_player_volume),
    },
    ...result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      artist: row.artist || null,
      url: musicUrl(row.public_id),
      builtIn: false,
      duration: row.duration ? Number(row.duration) : null,
      start: readTrackStart(row.start_at),
      volume: readTrackVolume(row.player_volume),
    })),
  ];
}

export async function getMusicSettings(): Promise<MusicSettings> {
  await ensureMusicSchema();
  const result = await db.query<{ mode: string; single_track: string; page_tracks: Record<string, unknown> | null }>(
    'SELECT mode, single_track, page_tracks FROM music_settings WHERE id = 1'
  );
  const row = result.rows[0];
  const stored = row?.page_tracks ?? {};
  // Página nunca configurada: segue com a música original (como o site sempre funcionou).
  const pageTracks = Object.fromEntries(
    MUSIC_PAGE_KEYS.map((key) => {
      const value = stored[key];
      return [key, value === null ? null : typeof value === 'string' && value ? value : DEFAULT_TRACK_ID];
    })
  ) as Record<MusicPageKey, string | null>;
  return { mode: row?.mode === 'per_page' ? 'per_page' : 'single', singleTrack: row?.single_track || DEFAULT_TRACK_ID, pageTracks };
}

/** O que cada página toca (URL e título), já resolvido; música excluída vira a original. */
export async function getPublicMusic() {
  const [settings, tracks] = await Promise.all([getMusicSettings(), listTracks()]);
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const resolve = (id: string | null) => {
    if (id === null) return null;
    const track = byId.get(id) ?? byId.get(DEFAULT_TRACK_ID)!;
    // volume vai de 0 a 1: é onde a barra do player começa nesta música.
    return { id: track.id, title: track.title, artist: track.artist, url: track.url, start: track.start, volume: track.volume / 100 };
  };
  const pages = Object.fromEntries(
    MUSIC_PAGE_KEYS.map((key) => [key, resolve(settings.mode === 'single' ? settings.singleTrack : settings.pageTracks[key])])
  ) as Record<MusicPageKey, { id: string; title: string; artist: string | null; url: string; start: number; volume: number } | null>;
  return { mode: settings.mode, pages };
}
