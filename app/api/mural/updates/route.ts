import { NextRequest, NextResponse } from 'next/server';
import { isCloudinaryConfigured } from '@/lib/cloudinary';
import { getMuralSettings, listPosts, readViewerId } from '@/lib/mural';

export const dynamic = 'force-dynamic';

// Só o que mudou desde a última vez: posts novos (mais novos que "after") e os posts que o celular já mostra
// (curtidas, comentários; os que sumiram vêm em "removed"). Evita baixar o mural inteiro de novo.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const viewerId = readViewerId(body?.viewerId);
    const after = typeof body?.after === 'string' && /^\d{1,18}$/.test(body.after) ? body.after : null;
    const ids: string[] = Array.isArray(body?.ids)
      ? body.ids.filter((id: unknown): id is string => typeof id === 'string' && /^\d{1,18}$/.test(id)).slice(0, 200)
      : [];
    const [settings, fresh, current] = await Promise.all([
      getMuralSettings(),
      after ? listPosts({ viewerCode: viewerId, afterId: after, limit: 30 }) : Promise.resolve([]),
      ids.length ? listPosts({ viewerCode: viewerId, ids, limit: 200 }) : Promise.resolve([]),
    ]);
    const stillThere = new Set(current.map((post) => post.id));
    return NextResponse.json(
      {
        settings: { ...settings, uploadsReady: isCloudinaryConfigured() },
        posts: fresh,
        updated: current,
        removed: ids.filter((id) => !stillThere.has(id)),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Falha ao buscar novidades do mural', error);
    return NextResponse.json({ error: 'Erro ao atualizar o mural.' }, { status: 500 });
  }
}
