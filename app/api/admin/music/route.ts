import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequestAuthorized } from '@/lib/admin-auth';
import { db } from '@/lib/db';
import { MUSIC_FOLDER, createMusicUploadSignature, destroyMedia, isCloudinaryConfigured, verifyUploadResponse } from '@/lib/cloudinary';
import { cleanText } from '@/lib/mural';
import {
  DEFAULT_TRACK_ID,
  MUSIC_PAGES,
  MUSIC_PAGE_KEYS,
  TRACK_ARTIST_MAX_LENGTH,
  TRACK_TITLE_MAX_LENGTH,
  ensureMusicSchema,
  getMusicSettings,
  listTracks,
  readTrackStart,
  type MusicPageKey,
} from '@/lib/music';

export const dynamic = 'force-dynamic';

const unauthorized = () => NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });

// Painel: biblioteca de músicas e o que toca em cada página.
export async function GET(request: NextRequest) {
  if (!(await isAdminRequestAuthorized(request))) return unauthorized();
  try {
    const [tracks, settings] = await Promise.all([listTracks(), getMusicSettings()]);
    return NextResponse.json({ tracks, settings, pages: MUSIC_PAGES, uploadsReady: isCloudinaryConfigured() });
  } catch (error) {
    console.error('Falha ao carregar as músicas (admin)', error);
    return NextResponse.json({ error: 'Erro ao carregar as músicas.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdminRequestAuthorized(request))) return unauthorized();
  try {
    await ensureMusicSchema();
    const body = await request.json().catch(() => null);

    // Assinatura para o painel enviar o arquivo direto ao Cloudinary.
    if (body?.action === 'sign') {
      if (!isCloudinaryConfigured()) return NextResponse.json({ error: 'O envio de arquivos não está configurado.' }, { status: 503 });
      return NextResponse.json(createMusicUploadSignature());
    }

    // Música enviada: guarda na biblioteca (só aceita arquivos que o Cloudinary confirma na pasta de músicas).
    if (body?.action === 'add') {
      const publicId = typeof body?.publicId === 'string' ? body.publicId : '';
      const version = typeof body?.version === 'string' || typeof body?.version === 'number' ? body.version : '';
      const signature = typeof body?.signature === 'string' ? body.signature : '';
      if (!publicId || !verifyUploadResponse(publicId, version, signature, MUSIC_FOLDER)) {
        return NextResponse.json({ error: 'Envio inválido. Tente de novo.' }, { status: 400 });
      }
      const title = cleanText(body?.title, TRACK_TITLE_MAX_LENGTH) || 'Música sem nome';
      const artist = cleanText(body?.artist, TRACK_ARTIST_MAX_LENGTH) || null;
      const duration = Number.isFinite(Number(body?.duration)) ? Number(body.duration) : null;
      await db.query('INSERT INTO music_tracks (title, artist, public_id, duration) VALUES ($1, $2, $3, $4) ON CONFLICT (public_id) DO NOTHING', [
        title,
        artist,
        publicId,
        duration,
      ]);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error) {
    console.error('Falha ao salvar música (admin)', error);
    return NextResponse.json({ error: 'Erro ao salvar a música.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await isAdminRequestAuthorized(request))) return unauthorized();
  try {
    await ensureMusicSchema();
    const body = await request.json().catch(() => null);
    const tracks = await listTracks();
    const validIds = new Set(tracks.map((track) => track.id));

    // Editar nome, autoria e ponto de início de uma música (a original do site guarda os dados nas configurações).
    if (body?.action === 'edit') {
      const title = cleanText(body?.title, TRACK_TITLE_MAX_LENGTH);
      const artist = cleanText(body?.artist, TRACK_ARTIST_MAX_LENGTH) || null;
      if (!title) return NextResponse.json({ error: 'Informe um nome.' }, { status: 400 });
      const id = String(body?.id ?? '');
      const track = tracks.find((item) => item.id === id);
      const start = readTrackStart(body?.start);
      if (track?.duration && start >= track.duration - 1) {
        return NextResponse.json({ error: 'O início precisa ser antes do fim da música.' }, { status: 400 });
      }
      if (id === DEFAULT_TRACK_ID) {
        await db.query('UPDATE music_settings SET default_title = $1, default_artist = $2, default_start = $3, updated_at = NOW() WHERE id = 1', [
          title,
          artist,
          start,
        ]);
        return NextResponse.json({ ok: true });
      }
      const result = await db.query('UPDATE music_tracks SET title = $2, artist = $3, start_at = $4 WHERE id::text = $1', [id, title, artist, start]);
      return result.rowCount ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Música não encontrada.' }, { status: 404 });
    }

    // Modo e música de cada página.
    if (body?.action === 'settings') {
      const mode = body?.mode === 'per_page' ? 'per_page' : 'single';
      const singleTrack = typeof body?.singleTrack === 'string' && validIds.has(body.singleTrack) ? body.singleTrack : DEFAULT_TRACK_ID;
      const pageTracks: Record<MusicPageKey, string | null> = {} as Record<MusicPageKey, string | null>;
      for (const key of MUSIC_PAGE_KEYS) {
        const value = body?.pageTracks?.[key];
        pageTracks[key] = value === null ? null : typeof value === 'string' && validIds.has(value) ? value : DEFAULT_TRACK_ID;
      }
      await db.query('UPDATE music_settings SET mode = $1, single_track = $2, page_tracks = $3::jsonb, updated_at = NOW() WHERE id = 1', [
        mode,
        singleTrack,
        JSON.stringify(pageTracks),
      ]);
      return NextResponse.json({ settings: await getMusicSettings() });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error) {
    console.error('Falha ao atualizar músicas (admin)', error);
    return NextResponse.json({ error: 'Erro ao salvar.' }, { status: 500 });
  }
}

// Excluir uma música (o arquivo sai do Cloudinary; páginas que usavam passam para a música original).
export async function DELETE(request: NextRequest) {
  if (!(await isAdminRequestAuthorized(request))) return unauthorized();
  try {
    await ensureMusicSchema();
    const body = await request.json().catch(() => null);
    const id = String(body?.id ?? '');
    if (id === DEFAULT_TRACK_ID) return NextResponse.json({ error: 'A música original do site não pode ser excluída.' }, { status: 400 });
    const result = await db.query<{ public_id: string }>('DELETE FROM music_tracks WHERE id::text = $1 RETURNING public_id', [id]);
    const removed = result.rows[0];
    if (!removed) return NextResponse.json({ error: 'Música não encontrada.' }, { status: 404 });
    // Quem usava a música excluída volta para a original.
    const settings = await getMusicSettings();
    const pageTracks = Object.fromEntries(MUSIC_PAGE_KEYS.map((key) => [key, settings.pageTracks[key] === id ? DEFAULT_TRACK_ID : settings.pageTracks[key]]));
    await db.query('UPDATE music_settings SET single_track = $1, page_tracks = $2::jsonb, updated_at = NOW() WHERE id = 1', [
      settings.singleTrack === id ? DEFAULT_TRACK_ID : settings.singleTrack,
      JSON.stringify(pageTracks),
    ]);
    await destroyMedia('video', removed.public_id).catch(() => false);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Falha ao excluir música (admin)', error);
    return NextResponse.json({ error: 'Erro ao excluir.' }, { status: 500 });
  }
}
