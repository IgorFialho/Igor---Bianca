import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { FREE_PIX_MAX_CENTS, FREE_PIX_MESSAGE_MAX, FREE_PIX_MIN_CENTS, ensureFreePixSchema } from '@/lib/gifts';

export const dynamic = 'force-dynamic';

// Convidado avisa que fez um Pix avulso (nome + valor, recado opcional). Fica "aguardando confirmação" até os noivos
// conferirem no extrato, como os presentes da lista.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const guestName = typeof body?.guestName === 'string' ? body.guestName.replace(/\s+/g, ' ').trim().slice(0, 150) : '';
    const amountCents = Number(body?.amountCents);
    const message = typeof body?.message === 'string' ? body.message.trim().slice(0, FREE_PIX_MESSAGE_MAX) || null : null;
    const inviteCode = typeof body?.inviteCode === 'string' ? body.inviteCode.trim().slice(0, 80) || null : null;

    if (guestName.length < 2) {
      return NextResponse.json({ error: 'Informe seu nome para os noivos saberem quem presenteou.' }, { status: 400 });
    }
    if (!Number.isInteger(amountCents) || amountCents < FREE_PIX_MIN_CENTS || amountCents > FREE_PIX_MAX_CENTS) {
      return NextResponse.json({ error: 'Valor inválido.' }, { status: 400 });
    }

    await ensureFreePixSchema();
    // Evita registro repetido (duplo toque): mesmo nome e valor nos últimos 2 minutos.
    const duplicate = await db.query(
      `SELECT 1 FROM gift_free_pix WHERE LOWER(guest_name) = LOWER($1) AND amount_cents = $2 AND created_at > NOW() - INTERVAL '2 minutes' LIMIT 1`,
      [guestName, amountCents]
    );
    if (!duplicate.rowCount) {
      await db.query('INSERT INTO gift_free_pix (guest_name, amount_cents, message, invite_code) VALUES ($1, $2, $3, $4)', [
        guestName,
        amountCents,
        message,
        inviteCode,
      ]);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Falha ao registrar Pix avulso', error);
    return NextResponse.json({ error: 'Erro ao registrar o Pix.' }, { status: 500 });
  }
}
