import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { COMMENT_DELETE_WINDOW_SECONDS, COMMENT_MAX_LENGTH, cleanText, ensureMuralSchema, getMuralSettings, listComments, readAuthorName, readViewerId } from '@/lib/mural';

export const dynamic = 'force-dynamic';

// Comentários de um post (visíveis a todos). ?viewerId= marca os comentários do próprio aparelho.
export async function GET(request: NextRequest) {
  try {
    const viewerId = readViewerId(request.nextUrl.searchParams.get('viewerId'));
    const postId = request.nextUrl.searchParams.get('postId') ?? '';
    const comments = await listComments(postId, { viewerCode: viewerId });
    return NextResponse.json({ comments }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Falha ao listar comentários do mural', error);
    return NextResponse.json({ error: 'Erro ao carregar os comentários.' }, { status: 500 });
  }
}

// Comentar: basta o nome (mural aberto).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const viewerId = readViewerId(body?.viewerId);
    const name = readAuthorName(body?.name);
    if (!viewerId) {
      return NextResponse.json({ error: 'Recarregue a página e tente de novo.' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: 'Informe o seu nome para comentar.' }, { status: 400 });
    }
    if (!(await getMuralSettings()).isOpen) {
      return NextResponse.json({ error: 'O mural está fechado.' }, { status: 403 });
    }
    const text = cleanText(body?.text, COMMENT_MAX_LENGTH);
    if (!text) {
      return NextResponse.json({ error: 'Escreva um comentário.' }, { status: 400 });
    }
    await ensureMuralSchema();
    const postId = String(body?.postId ?? '');
    const post = await db.query('SELECT 1 FROM mural_posts WHERE id::text = $1 AND is_hidden = FALSE', [postId]);
    if (!post.rowCount) {
      return NextResponse.json({ error: 'Post não encontrado.' }, { status: 404 });
    }
    await db.query(`INSERT INTO mural_comments (post_id, invite_code, author_name, text) VALUES ($1::bigint, $2, $3, $4)`, [postId, viewerId, name, text]);
    const comments = await listComments(postId, { viewerCode: viewerId });
    return NextResponse.json({ comments });
  } catch (error) {
    console.error('Falha ao comentar no mural', error);
    return NextResponse.json({ error: 'Erro ao comentar.' }, { status: 500 });
  }
}

// Quem comentou (o mesmo aparelho) pode apagar o próprio comentário só nos primeiros 5 minutos;
// depois disso, apenas o admin apaga.
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const viewerId = readViewerId(body?.viewerId);
    if (!viewerId) {
      return NextResponse.json({ error: 'Comentário não encontrado.' }, { status: 404 });
    }
    await ensureMuralSchema();
    const commentId = String(body?.commentId ?? '');
    const result = await db.query<{ post_id: string }>(
      `
        DELETE FROM mural_comments
        WHERE id::text = $1 AND invite_code = $2 AND created_at > NOW() - make_interval(secs => $3)
        RETURNING post_id::text
      `,
      [commentId, viewerId, COMMENT_DELETE_WINDOW_SECONDS]
    );
    if (!result.rows[0]) {
      const mine = await db.query('SELECT 1 FROM mural_comments WHERE id::text = $1 AND invite_code = $2', [commentId, viewerId]);
      return mine.rowCount
        ? NextResponse.json({ error: 'O prazo de 5 minutos para apagar terminou. Agora só os noivos podem apagar este comentário.' }, { status: 403 })
        : NextResponse.json({ error: 'Comentário não encontrado.' }, { status: 404 });
    }
    const comments = await listComments(result.rows[0].post_id, { viewerCode: viewerId });
    return NextResponse.json({ comments });
  } catch (error) {
    console.error('Falha ao apagar comentário do mural', error);
    return NextResponse.json({ error: 'Erro ao apagar o comentário.' }, { status: 500 });
  }
}
