import { NextResponse } from 'next/server';
import { ADMIN_AUTH_COOKIE } from '@/lib/admin-auth';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ADMIN_AUTH_COOKIE,
    value: '',
    path: '/',
    expires: new Date(0),
  });

  return response;
}
