import { NextRequest, NextResponse } from 'next/server';
import { isCloudinaryConfigured } from '@/lib/cloudinary';
import { getMuralSettings, listPosts, readViewerId, resolveGuest } from '@/lib/mural';

export const dynamic = 'force-dynamic';

// Mural (aberto a todos): posts visíveis + situação (aberto/fechado).
// ?viewerId= marca as curtidas/posts do próprio aparelho; ?code= (opcional) sugere o nome de quem tem convite.
export async function GET(request: NextRequest) {
  try {
    const viewerId = readViewerId(request.nextUrl.searchParams.get('viewerId'));
    const code = request.nextUrl.searchParams.get('code');
    const [settings, posts, guest] = await Promise.all([
      getMuralSettings(),
      listPosts({ viewerCode: viewerId }),
      code ? resolveGuest(code) : Promise.resolve(null),
    ]);
    return NextResponse.json(
      {
        suggestedName: guest?.name ?? null,
        settings: { ...settings, uploadsReady: isCloudinaryConfigured() },
        posts,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Falha ao carregar o mural', error);
    return NextResponse.json({ error: 'Erro ao carregar o mural.' }, { status: 500 });
  }
}
