import { NextResponse } from 'next/server';
import { getMuralPulse, getMuralSettings } from '@/lib/mural';

export const dynamic = 'force-dynamic';

// Pulso do mural: resposta minúscula que só muda quando algo muda (o celular consulta a cada poucos segundos).
export async function GET() {
  try {
    const [pulse, settings] = await Promise.all([getMuralPulse(), getMuralSettings()]);
    const version = `${pulse}.${settings.isOpen ? 1 : 0}`;
    return NextResponse.json({ version }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Falha ao consultar o pulso do mural', error);
    return NextResponse.json({ error: 'Erro ao consultar o mural.' }, { status: 500 });
  }
}
