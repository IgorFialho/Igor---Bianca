import { NextRequest, NextResponse } from 'next/server';
import { isCloudinaryConfigured } from '@/lib/cloudinary';
import { getAdminSession } from '@/lib/admin-auth';
import { getMuralSettings, listPosts, readViewerId, resolveGuest } from '@/lib/mural';

export const dynamic = 'force-dynamic';

// Mural (aberto a todos): posts visíveis + situação (aberto/fechado).
// ?viewerId= marca as curtidas/posts do próprio aparelho; ?code= (opcional) sugere o nome de quem tem convite.
export async function GET(request: NextRequest) {
  try {
    const viewerId = readViewerId(request.nextUrl.searchParams.get('viewerId'));
    const code = request.nextUrl.searchParams.get('code');
    // Páginas (rolagem infinita): ?limit= e ?before=<id do último post já carregado>. Sem limit: lista completa (telão).
    const limitParam = Number(request.nextUrl.searchParams.get('limit'));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(50, Math.round(limitParam)) : 400;
    const beforeId = request.nextUrl.searchParams.get('before');
    const [settings, posts, guest, admin] = await Promise.all([
      getMuralSettings(),
      listPosts({ viewerCode: viewerId, limit, beforeId }),
      code ? resolveGuest(code) : Promise.resolve(null),
      getAdminSession(request),
    ]);
    return NextResponse.json(
      {
        suggestedName: guest?.name ?? null,
        // Noivo/noiva logados no painel: publicam com o próprio nome e o post sai em destaque.
        viewerAdmin: admin ? { role: admin.role, name: admin.name } : null,
        settings: { ...settings, uploadsReady: isCloudinaryConfigured() },
        posts,
        // Ainda há posts mais antigos para carregar ao rolar.
        hasMore: posts.length === limit,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Falha ao carregar o mural', error);
    return NextResponse.json({ error: 'Erro ao carregar o mural.' }, { status: 500 });
  }
}
