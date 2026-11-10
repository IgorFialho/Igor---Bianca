import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequestAuthorized } from '@/lib/admin-auth';
import { archiveDownloadUrl, isCloudinaryConfigured } from '@/lib/cloudinary';

export const dynamic = 'force-dynamic';

// "Baixar tudo": redireciona para um .zip gerado pelo Cloudinary com todas as fotos (?type=image) ou vídeos (?type=video).
export async function GET(request: NextRequest) {
  if (!(await isAdminRequestAuthorized(request))) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }
  if (!isCloudinaryConfigured()) {
    return NextResponse.json({ error: 'Cloudinary não configurado.' }, { status: 503 });
  }
  const kind = request.nextUrl.searchParams.get('type') === 'video' ? 'video' : 'image';
  return NextResponse.redirect(archiveDownloadUrl(kind));
}
