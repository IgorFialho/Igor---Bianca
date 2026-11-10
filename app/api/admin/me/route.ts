import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

// Quem está logado no painel (noivo ou noiva), para mostrar o ícone e o nome no topo.
export async function GET(request: NextRequest) {
  const admin = await getAdminSession(request);
  if (!admin) return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });
  return NextResponse.json({ admin: { role: admin.role, name: admin.name } }, { headers: { 'Cache-Control': 'no-store' } });
}
