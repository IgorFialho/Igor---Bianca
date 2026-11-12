import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth';
import { ensureMuralSchema, getMuralSettings, listComments, readViewerId } from '@/lib/mural';

// Curtir / descurtir um comentário (uma curtida por aparelho). Devolve a lista já reordenada (mais curtidos primeiro).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const viewerId = readViewerId(body?.viewerId);
    if (!viewerId) {
      return NextResponse.json({ error: 'Recarregue a página e tente de novo.' }, { status: 400 });
    }
    // Noivo/noiva podem curtir mesmo com o mural fechado para os convidados.
    if (!(await getAdminSession(request)) && !(await getMuralSettings()).isOpen) {
      return NextResponse.json({ error: 'O mural está fechado.' }, { status: 403 });
    }
    await ensureMuralSchema();
    const commentId = String(body?.commentId ?? '');
    const like = body?.like !== false;

    const comment = await db.query<{ post_id: string }>(
      'SELECT post_id::text FROM mural_comments WHERE id::text = $1 AND is_hidden = FALSE',
      [commentId]
    );
    const postId = comment.rows[0]?.post_id;
    if (!postId) {
      return NextResponse.json({ error: 'Comentário não encontrado.' }, { status: 404 });
    }
    if (like) {
      await db.query('INSERT INTO mural_comment_likes (comment_id, invite_code) VALUES ($1::bigint, $2) ON CONFLICT DO NOTHING', [commentId, viewerId]);
    } else {
      await db.query('DELETE FROM mural_comment_likes WHERE comment_id::text = $1 AND invite_code = $2', [commentId, viewerId]);
    }
    const comments = await listComments(postId, { viewerCode: viewerId });
    return NextResponse.json({ comments });
  } catch (error) {
    console.error('Falha ao curtir comentário do mural', error);
    return NextResponse.json({ error: 'Erro ao curtir o comentário.' }, { status: 500 });
  }
}
