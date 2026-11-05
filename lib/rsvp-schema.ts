import { db } from '@/lib/db';

let ready: Promise<void> | null = null;

/**
 * Colunas novas do RSVP, criadas na primeira vez que forem usadas (não alteram respostas existentes):
 * - children_not_attending: o casal tem filhos, mas avisou que eles não irão.
 */
export function ensureRsvpSchema() {
  ready ??= db
    .query('ALTER TABLE rsvp_responses ADD COLUMN IF NOT EXISTS children_not_attending BOOLEAN NOT NULL DEFAULT FALSE')
    .then(() => undefined)
    .catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}
