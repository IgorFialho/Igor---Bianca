import { NextRequest, NextResponse } from 'next/server';

// Sem cookie de sessão, /admin vai direto para o login (a validação de verdade é feita nas rotas /api/admin).
export function middleware(request: NextRequest) {
  if (!request.cookies.get('igor_bianca_admin_session')?.value) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin'],
};
