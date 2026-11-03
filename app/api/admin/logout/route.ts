import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_AUTH_COOKIE, deleteAdminSession } from '@/lib/admin-auth';

// Sair apaga a sessão no banco (o cookie deixa de valer mesmo se alguém tiver copiado) e no navegador.
export async function POST(request: NextRequest) {
  try {
    await deleteAdminSession(request);
  } catch (error) {
    console.error('Falha ao encerrar sessao admin', error);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ADMIN_AUTH_COOKIE,
    value: '',
    path: '/',
    expires: new Date(0),
  });

  return response;
}
