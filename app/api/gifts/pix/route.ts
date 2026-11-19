import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { buildPixPayload, getPixConfig } from '@/lib/pix';

export const dynamic = 'force-dynamic';

/** Maior valor aceito no Pix avulso (R$ 100.000,00), só para evitar códigos absurdos. */
const MAX_FREE_AMOUNT_CENTS = 10_000_000;

// Gera o Pix (copia e cola + QR Code). Aberto a qualquer pessoa na lista de presentes.
// ?gift=<id>: valor do presente. Pix avulso: ?amount=<centavos> (valor escolhido pelo convidado).
export async function GET(request: NextRequest) {
  const giftId = request.nextUrl.searchParams.get('gift')?.trim() ?? '';
  const amountParam = request.nextUrl.searchParams.get('amount')?.trim() ?? '';

  const config = getPixConfig();
  if (!config) {
    return NextResponse.json({ error: 'O Pix ainda não foi configurado pelos noivos.' }, { status: 503 });
  }

  try {
    let amountCents: number | null;
    if (giftId) {
      if (!/^\d+$/.test(giftId)) {
        return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 });
      }
      const result = await db.query<{ price_cents: number }>(
        `SELECT price_cents FROM gifts WHERE id = $1 AND is_active = TRUE`,
        [giftId]
      );
      const gift = result.rows[0];
      if (!gift) {
        return NextResponse.json({ error: 'Presente não encontrado.' }, { status: 404 });
      }
      amountCents = gift.price_cents;
    } else if (/^\d+$/.test(amountParam) && Number(amountParam) >= 100 && Number(amountParam) <= MAX_FREE_AMOUNT_CENTS) {
      amountCents = Number(amountParam);
    } else {
      return NextResponse.json({ error: 'Informe um valor a partir de R$ 1,00.' }, { status: 400 });
    }

    const payload = buildPixPayload(config, amountCents);
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
