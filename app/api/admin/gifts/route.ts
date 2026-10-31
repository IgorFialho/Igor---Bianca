import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequestAuthorized } from '@/lib/admin-auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

type AdminGiftRow = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  price_cents: number;
  store_url: string | null;
  is_active: boolean;
  created_at: string;
};

type AdminContributionRow = {
  id: string;
  gift_id: string;
  gift_title: string;
  price_cents: number;
  invite_code_used: string;
  guest_name: string | null;
  method: 'pix' | 'store';
  message: string | null;
  status: 'pending' | 'confirmed' | 'cancelled';
  created_at: string;
  confirmed_at: string | null;
};

const unauthorized = () => NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });

function readGiftInput(body: Record<string, unknown>) {
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
  const description = typeof body.description === 'string' ? body.description.trim() || null : null;
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() || null : null;
  const storeUrl = typeof body.storeUrl === 'string' ? body.storeUrl.trim() || null : null;
  // Aceita "1.299,90", "1299.90" ou número.
  const rawPrice = typeof body.price === 'number' ? String(body.price) : String(body.price ?? '');
  const normalizedPrice = rawPrice.includes(',') ? rawPrice.replace(/\./g, '').replace(',', '.') : rawPrice;
  const priceCents = Math.round(Number(normalizedPrice) * 100);
  return { title, description, imageUrl, storeUrl, priceCents };
}

// Lista todos os presentes (inclusive inativos) e todas as escolhas dos convidados.
export async function GET(request: NextRequest) {
  if (!isAdminRequestAuthorized(request)) return unauthorized();

  try {
    const [gifts, contributions] = await Promise.all([
      db.query<AdminGiftRow>(
        `SELECT id::text, title, description, image_url, price_cents, store_url, is_active, created_at::text
         FROM gifts ORDER BY created_at DESC`
      ),
      db.query<AdminContributionRow>(
        `SELECT c.id::text, c.gift_id::text, g.title AS gift_title, g.price_cents, c.invite_code_used, c.guest_name,
                c.method, c.message, c.status, c.created_at::text, c.confirmed_at::text
         FROM gift_contributions c
         INNER JOIN gifts g ON g.id = c.gift_id
         ORDER BY (c.status = 'pending') DESC, c.created_at DESC
         LIMIT 300`
      ),
    ]);

    return NextResponse.json({ gifts: gifts.rows, contributions: contributions.rows });
  } catch (error) {
    console.error('Falha ao listar presentes (admin)', error);
    return NextResponse.json({ error: 'Erro ao buscar presentes.' }, { status: 500 });
  }
}

// Cadastra um presente.
export async function POST(request: NextRequest) {
  if (!isAdminRequestAuthorized(request)) return unauthorized();

  try {
    const input = readGiftInput(await request.json());
    if (!input.title || !Number.isFinite(input.priceCents) || input.priceCents <= 0) {
      return NextResponse.json({ error: 'Informe o nome e um valor válido.' }, { status: 400 });
    }

    const result = await db.query<AdminGiftRow>(
      `INSERT INTO gifts (title, description, image_url, price_cents, store_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id::text, title, description, image_url, price_cents, store_url, is_active, created_at::text`,
      [input.title, input.description, input.imageUrl, input.priceCents, input.storeUrl]
    );
    return NextResponse.json({ gift: result.rows[0] });
  } catch (error) {
    console.error('Falha ao criar presente', error);
    return NextResponse.json({ error: 'Erro ao cadastrar presente.' }, { status: 500 });
  }
}

// Ações: { action: 'toggle', giftId, isActive } | { action: 'contribution', contributionId, status }.
export async function PATCH(request: NextRequest) {
  if (!isAdminRequestAuthorized(request)) return unauthorized();

  try {
    const body = await request.json();

    if (body?.action === 'toggle') {
      await db.query(`UPDATE gifts SET is_active = $2 WHERE id = $1`, [String(body.giftId), Boolean(body.isActive)]);
      return NextResponse.json({ ok: true });
    }

    if (body?.action === 'contribution' && ['confirmed', 'cancelled', 'pending'].includes(body.status)) {
      try {
        await db.query(
          `UPDATE gift_contributions
           SET status = $2::varchar, confirmed_at = CASE WHEN $2::varchar = 'confirmed' THEN NOW() ELSE NULL END
           WHERE id = $1`,
          [String(body.contributionId), body.status]
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          return NextResponse.json({ error: 'Este presente já foi escolhido por outro convidado.' }, { status: 409 });
        }
        throw error;
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error) {
    console.error('Falha ao atualizar presente', error);
    return NextResponse.json({ error: 'Erro ao atualizar.' }, { status: 500 });
  }
}

// Exclui um presente (e o histórico de quem o escolheu).
export async function DELETE(request: NextRequest) {
  if (!isAdminRequestAuthorized(request)) return unauthorized();

  try {
    const body = await request.json();
    await db.query(`DELETE FROM gifts WHERE id = $1`, [String(body?.giftId ?? '')]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Falha ao excluir presente', error);
    return NextResponse.json({ error: 'Erro ao excluir presente.' }, { status: 500 });
  }
}
