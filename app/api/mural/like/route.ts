import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureMuralSchema, getMuralSettings, readViewerId } from '@/lib/mural';

// Curtir / descurtir um post (uma curtida por aparelho).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const viewerId = readViewerId(body?.viewerId);
    if (!viewerId) {
      return NextResponse.json({ error: 'Recarregue a página e tente de novo.' }, { status: 400 });
    }
    if (!(await getMuralSettings()).isOpen) {
      return NextResponse.json({ error: 'O mural está fechado.' }, { status: 403 });
    }
    await ensureMuralSchema();
    const postId = String(body?.postId ?? '');
    const like = body?.like !== false;

    const post = await db.query('SELECT 1 FROM mural_posts WHERE id::text = $1 AND is_hidden = FALSE', [postId]);
    if (!post.rowCount) {
      return NextResponse.json({ error: 'Post não encontrado.' }, { status: 404 });
    }
    if (like) {
      await db.query(`INSERT INTO mural_likes (post_id, invite_code) VALUES ($1::bigint, $2) ON CONFLICT DO NOTHING`, [postId, viewerId]);
    } else {
      await db.query(`DELETE FROM mural_likes WHERE post_id::text = $1 AND invite_code = $2`, [postId, viewerId]);
    }
    const count = await db.query<{ total: number }>('SELECT COUNT(*)::int AS total FROM mural_likes WHERE post_id::text = $1', [postId]);
    return NextResponse.json({ liked: like, likes: count.rows[0]?.total ?? 0 });
  } catch (error) {
    console.error('Falha ao curtir post do mural', error);
    return NextResponse.json({ error: 'Erro ao curtir.' }, { status: 500 });
  }
}
