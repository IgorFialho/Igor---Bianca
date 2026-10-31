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
