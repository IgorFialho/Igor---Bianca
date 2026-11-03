import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_AUTH_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createAdminSession,
  getLoginLockMinutes,
  getRequestIp,
  isAdminPasswordConfigured,
  recordLoginAttempt,
  validateAdminCredentials,
} from '@/lib/admin-auth';

const lockedMessage = (minutes: number) =>
  `Muitas tentativas erradas. Tente de novo em ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`;

export async function POST(request: NextRequest) {
  try {
    if (!isAdminPasswordConfigured()) {
      console.error('ADMIN_USERNAME ausente ou ADMIN_PASSWORD com menos de 12 caracteres: login do admin desativado.');
      return NextResponse.json({ error: 'Login do painel indisponível no momento.' }, { status: 503 });
    }

    // Só aceita login enviado pelo próprio site.
    const origin = request.headers.get('origin');
    let originHost = '';
    try {
      originHost = origin ? new URL(origin).host : '';
    } catch {
      originHost = '';
    }
    if (!originHost || originHost !== request.headers.get('host')) {
      return NextResponse.json({ error: 'Requisição não permitida.' }, { status: 403 });
    }

    const ip = getRequestIp(request);
    const lockMinutes = await getLoginLockMinutes(ip);
    if (lockMinutes > 0) {
      return NextResponse.json({ error: lockedMessage(lockMinutes), lockedMinutes: lockMinutes }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const username = typeof body?.username === 'string' ? body.username.slice(0, 100) : '';
    const password = typeof body?.password === 'string' ? body.password.slice(0, 200) : '';

    if (!validateAdminCredentials(username, password)) {
      await recordLoginAttempt(ip, false);
      // Pequena espera em toda senha errada: deixa tentativas em massa bem mais lentas.
      await new Promise((resolve) => setTimeout(resolve, 600));
      const nowLocked = await getLoginLockMinutes(ip);
      return nowLocked > 0
        ? NextResponse.json({ error: lockedMessage(nowLocked), lockedMinutes: nowLocked }, { status: 429 })
        : NextResponse.json({ error: 'Usuário ou senha incorretos.' }, { status: 401 });
    }

    await recordLoginAttempt(ip, true);
    const token = await createAdminSession(request);

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: ADMIN_AUTH_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    // Remove o cookie do formato antigo (hash fixo da senha), se ainda existir no navegador.
    response.cookies.set({ name: 'igor_bianca_admin_auth', value: '', path: '/', expires: new Date(0) });

    return response;
  } catch (error) {
    console.error('Falha no login admin', error);
    return NextResponse.json({ error: 'Erro interno no login admin.' }, { status: 500 });
  }
}
