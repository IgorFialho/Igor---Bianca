import { NextRequest, NextResponse } from 'next/server';
import { createUploadSignature, isCloudinaryConfigured } from '@/lib/cloudinary';
import { getAdminSession } from '@/lib/admin-auth';
import { getMuralSettings, readAuthorName, readViewerId } from '@/lib/mural';

// Assinatura para o celular enviar a foto/vídeo direto ao Cloudinary (mural aberto + nome informado).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!readViewerId(body?.viewerId)) {
      return NextResponse.json({ error: 'Recarregue a página e tente de novo.' }, { status: 400 });
    }
    if (!readAuthorName(body?.name)) {
      return NextResponse.json({ error: 'Informe o seu nome para publicar.' }, { status: 400 });
    }
    if (!isCloudinaryConfigured()) {
      return NextResponse.json({ error: 'O envio de fotos ainda não está configurado.' }, { status: 503 });
    }
    // Noivo/noiva (logados no painel) podem publicar mesmo com o mural fechado para os convidados.
    if (!(await getAdminSession(request)) && !(await getMuralSettings()).isOpen) {
      return NextResponse.json({ error: 'O mural ainda não está aberto para postagens.' }, { status: 403 });
    }
    const kind = body?.kind === 'video' ? 'video' : 'image';
    return NextResponse.json(createUploadSignature(kind));
  } catch (error) {
    console.error('Falha ao assinar envio do mural', error);
    return NextResponse.json({ error: 'Erro ao preparar o envio.' }, { status: 500 });
  }
}
