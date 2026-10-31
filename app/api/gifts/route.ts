import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { findActiveInvitation, type GiftStatus, type PublicGift } from '@/lib/gifts';

export const dynamic = 'force-dynamic';

type GiftRow = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  price_cents: number;
  store_url: string | null;
  contribution_status: 'pending' | 'confirmed' | null;
};

const NO_CACHE = { 'Cache-Control': 'no-store' };

// Lista os presentes ativos. Quem já foi escolhido aparece como "reservado" (aguardando confirmação do
// Pix) ou "presenteado"; o nome de quem deu fica só para os noivos, no painel admin.
export async function GET() {
  try {
    const result = await db.query<GiftRow>(
      `
        SELECT
          g.id::text, g.title, g.description, g.image_url, g.price_cents, g.store_url,
          c.status AS contribution_status
        FROM gifts g
        LEFT JOIN gift_contributions c ON c.gift_id = g.id AND c.status IN ('pending', 'confirmed')
        WHERE g.is_active = TRUE
        ORDER BY (c.id IS NOT NULL), g.price_cents, g.id
      `
    );

    const gifts: PublicGift[] = result.rows.map((row) => {
      const status: GiftStatus =
        row.contribution_status === 'confirmed' ? 'given' : row.contribution_status === 'pending' ? 'reserved' : 'available';
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        imageUrl: row.image_url,
        priceCents: row.price_cents,
        storeUrl: row.store_url,
        status,
      };
    });

    return NextResponse.json({ gifts }, { headers: NO_CACHE });
  } catch (error) {
    console.error('Falha ao listar presentes', error);
    return NextResponse.json({ error: 'Erro ao carregar a lista de presentes.' }, { status: 500 });
  }
}

// O convidado escolhe um presente: Pix ("já fiz o Pix") ou compra na loja ("já comprei").
// Fica pendente até os noivos confirmarem no painel; o índice único no banco impede dois presenteadores.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const giftId = String(body?.giftId ?? '').trim();
    const inviteCode = typeof body?.inviteCode === 'string' ? body.inviteCode.trim() : '';
    const guestName = typeof body?.guestName === 'string' ? body.guestName.trim().slice(0, 150) : '';
    const method = body?.method === 'store' ? 'store' : body?.method === 'pix' ? 'pix' : null;

    if (!/^\d+$/.test(giftId) || !method) {
      return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 });
    }
    if (guestName.length < 2) {
      return NextResponse.json({ error: 'Informe seu nome para presentear.' }, { status: 400 });
    }

    // O código do convite é opcional: se a pessoa entrou pelo convite, o presente fica ligado a ele.
    const invitation = inviteCode ? await findActiveInvitation(inviteCode) : null;

    const giftResult = await db.query<{ id: string; store_url: string | null }>(
      `SELECT id::text, store_url FROM gifts WHERE id = $1 AND is_active = TRUE`,
      [giftId]
    );
    const gift = giftResult.rows[0];
    if (!gift) {
      return NextResponse.json({ error: 'Presente não encontrado.' }, { status: 404 });
    }
    if (method === 'store' && !gift.store_url) {
      return NextResponse.json({ error: 'Este presente não tem loja cadastrada.' }, { status: 400 });
    }

    try {
      await db.query(
        `
          INSERT INTO gift_contributions (gift_id, invitation_code_id, invite_code_used, guest_name, method)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [giftId, invitation?.id ?? null, invitation?.code ?? '', guestName, method]
      );
    } catch (error) {
      // 23505 = violação do índice único: outra pessoa escolheu este presente primeiro.
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'Que pena! Alguém acabou de escolher este presente.' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Falha ao registrar presente', error);
    return NextResponse.json({ error: 'Erro ao registrar o presente.' }, { status: 500 });
  }
}
