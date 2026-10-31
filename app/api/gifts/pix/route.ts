import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { buildPixPayload, getPixConfig } from '@/lib/pix';

export const dynamic = 'force-dynamic';

// Gera o Pix (copia e cola + QR Code) com o valor do presente. Aberto a qualquer pessoa na lista de presentes.
export async function GET(request: NextRequest) {
  const giftId = request.nextUrl.searchParams.get('gift')?.trim() ?? '';

  if (!/^\d+$/.test(giftId)) {
    return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 });
  }

  const config = getPixConfig();
  if (!config) {
    return NextResponse.json({ error: 'O Pix ainda não foi configurado pelos noivos.' }, { status: 503 });
  }

  try {
    const result = await db.query<{ price_cents: number }>(
      `SELECT price_cents FROM gifts WHERE id = $1 AND is_active = TRUE`,
      [giftId]
    );
    const gift = result.rows[0];
    if (!gift) {
      return NextResponse.json({ error: 'Presente não encontrado.' }, { status: 404 });
    }

    // A referência aparece no extrato e ajuda os noivos a saber de qual presente é o Pix.
    const payload = buildPixPayload(config, gift.price_cents, `PRESENTE${giftId}`);
    const qrSvg = await QRCode.toString(payload, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#2f241b', light: '#fffaf1' },
    });

    return NextResponse.json(
      { payload, qrSvg, receiverName: config.receiverName },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Falha ao gerar Pix', error);
    return NextResponse.json({ error: 'Erro ao gerar o Pix.' }, { status: 500 });
  }
}
