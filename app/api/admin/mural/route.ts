import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequestAuthorized } from '@/lib/admin-auth';
import { db } from '@/lib/db';
import { destroyMedia, isCloudinaryConfigured, type MediaKind } from '@/lib/cloudinary';
import { ensureMuralSchema, getMuralSettings, listPosts } from '@/lib/mural';

export const dynamic = 'force-dynamic';

const unauthorized = () => NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });

type AdminComment = { id: string; post_id: string; author_name: string; text: string; is_hidden: boolean; created_at: string };

// Painel do mural: situação, todos os posts (inclusive ocultos) e os comentários.
export async function GET(request: NextRequest) {
  if (!(await isAdminRequestAuthorized(request))) return unauthorized();
  try {
    await ensureMuralSchema();
    const [settings, posts, comments] = await Promise.all([
      getMuralSettings(),
      listPosts({ includeHidden: true, limit: 2000 }),
      db.query<AdminComment>(
        `SELECT id::text, post_id::text, author_name, text, is_hidden, created_at FROM mural_comments ORDER BY created_at DESC LIMIT 2000`
      ),
    ]);
    return NextResponse.json({
      settings: { ...settings, uploadsReady: isCloudinaryConfigured() },
      posts,
      comments: comments.rows.map((row) => ({
        id: row.id,
        postId: row.post_id,
        authorName: row.author_name,
        text: row.text,
        isHidden: row.is_hidden,
        createdAt: new Date(row.created_at).toISOString(),
      })),
    });
  } catch (error) {
    console.error('Falha ao carregar o mural (admin)', error);
    return NextResponse.json({ error: 'Erro ao carregar o mural.' }, { status: 500 });
  }
}

// Abrir/fechar/agendar o mural e ocultar/mostrar posts e comentários.
export async function PATCH(request: NextRequest) {
  if (!(await isAdminRequestAuthorized(request))) return unauthorized();
  try {
    await ensureMuralSchema();
    const body = await request.json().catch(() => null);

    if (body?.action === 'settings') {
      const manualOpen = Boolean(body?.manualOpen);
      const readDate = (value: unknown) => {
        if (typeof value !== 'string' || !value) return { ok: true, iso: null as string | null };
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? { ok: false, iso: null } : { ok: true, iso: date.toISOString() };
      };
      const opens = readDate(body?.opensAt);
      const closes = readDate(body?.closesAt);
      if (!opens.ok) {
        return NextResponse.json({ error: 'Data de abertura inválida.' }, { status: 400 });
      }
      if (!closes.ok) {
        return NextResponse.json({ error: 'Data de fechamento inválida.' }, { status: 400 });
      }
      if (opens.iso && closes.iso && new Date(closes.iso) <= new Date(opens.iso)) {
        return NextResponse.json({ error: 'O fechamento precisa ser depois da abertura.' }, { status: 400 });
      }
      // "Abrir agora" depois de um fechamento que já passou: reabre e descarta esse horário antigo.
      const closesAt = manualOpen && closes.iso && new Date(closes.iso) <= new Date() ? null : closes.iso;
      await db.query(`UPDATE mural_settings SET is_open = $1, opens_at = $2, closes_at = $3, updated_at = NOW() WHERE id = 1`, [
        manualOpen,
        opens.iso,
        closesAt,
      ]);
      return NextResponse.json({ settings: { ...(await getMuralSettings()), uploadsReady: isCloudinaryConfigured() } });
    }

    if (body?.action === 'post' || body?.action === 'comment') {
      const table = body.action === 'post' ? 'mural_posts' : 'mural_comments';
      const result = await db.query(`UPDATE ${table} SET is_hidden = $2 WHERE id::text = $1`, [String(body?.id ?? ''), Boolean(body?.hidden)]);
      if (!result.rowCount) {
        return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error) {
    console.error('Falha ao atualizar o mural (admin)', error);
    return NextResponse.json({ error: 'Erro ao atualizar o mural.' }, { status: 500 });
  }
}

// Excluir um post (e o arquivo no Cloudinary) ou um comentário.
export async function DELETE(request: NextRequest) {
  if (!(await isAdminRequestAuthorized(request))) return unauthorized();
  try {
    await ensureMuralSchema();
    const body = await request.json().catch(() => null);

    if (body?.commentId) {
      const result = await db.query('DELETE FROM mural_comments WHERE id::text = $1', [String(body.commentId)]);
      return result.rowCount ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Comentário não encontrado.' }, { status: 404 });
    }

    const result = await db.query<{ public_id: string; media_type: MediaKind }>(
      'DELETE FROM mural_posts WHERE id::text = $1 RETURNING public_id, media_type',
      [String(body?.postId ?? '')]
    );
    const removed = result.rows[0];
    if (!removed) {
      return NextResponse.json({ error: 'Post não encontrado.' }, { status: 404 });
    }
    const fileRemoved = await destroyMedia(removed.media_type, removed.public_id).catch(() => false);
    return NextResponse.json({ ok: true, fileRemoved });
  } catch (error) {
    console.error('Falha ao excluir do mural (admin)', error);
    return NextResponse.json({ error: 'Erro ao excluir.' }, { status: 500 });
  }
}
