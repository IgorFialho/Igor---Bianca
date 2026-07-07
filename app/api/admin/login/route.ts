import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_AUTH_COOKIE, createAdminToken, validateAdminPassword } from '@/lib/admin-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!validateAdminPassword(password)) {
      return NextResponse.json({ error: 'Senha de admin invalida.' }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: ADMIN_AUTH_COOKIE,
      value: createAdminToken(),
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 8,
    });

    return response;
  } catch (error) {
    console.error('Falha no login admin', error);
    return NextResponse.json({ error: 'Erro interno no login admin.' }, { status: 500 });
  }
}
