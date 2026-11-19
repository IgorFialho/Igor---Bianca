import { db } from '@/lib/db';

export type GiftStatus = 'available' | 'reserved' | 'given';

export type PublicGift = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  storeUrl: string | null;
  status: GiftStatus;
};

export type InvitationRow = { id: string; code: string; guest_name: string | null };

/** Confere se o código do convite existe e está ativo. */
export async function findActiveInvitation(code: string) {
  const result = await db.query<InvitationRow>(
    `SELECT id::text, code, guest_name FROM invitation_codes WHERE UPPER(code) = UPPER($1) AND is_active = TRUE LIMIT 1`,
    [code.trim()]
  );
  return result.rows[0] ?? null;
}

export function formatPrice(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Nomes do convite gravados como "Ana | Bruno" viram "Ana e Bruno". */
export function displayGuestName(rawName: string | null, fallback: string) {
  const names = (rawName ?? '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
  return names.length ? names.join(' e ') : fallback;
}

// ---------- Pix avulso ----------
/** Valores aceitos no Pix avulso (R$ 1,00 a R$ 100.000,00). */
export const FREE_PIX_MIN_CENTS = 100;
export const FREE_PIX_MAX_CENTS = 10_000_000;
export const FREE_PIX_MESSAGE_MAX = 300;

let freePixReady: Promise<void> | null = null;

/** Cria a tabela de Pix avulsos na primeira vez (o convidado informa nome e valor ao tocar em "Já fiz o Pix"). */
export function ensureFreePixSchema() {
  freePixReady ??= db
    .query(
      `
        CREATE TABLE IF NOT EXISTS gift_free_pix (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          guest_name VARCHAR(150) NOT NULL,
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
          message VARCHAR(${FREE_PIX_MESSAGE_MAX}),
          invite_code VARCHAR(80),
          status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          confirmed_at TIMESTAMPTZ
        );
      `
    )
    .then(() => undefined)
    .catch((error) => {
      freePixReady = null;
      throw error;
    });
  return freePixReady;
}
