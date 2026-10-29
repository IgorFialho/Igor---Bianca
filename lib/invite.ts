export const INVITE_ACCESS_KEY = 'wedding-invite-access';

export type AttendanceChoice = 'yes' | 'no' | '';

export const weddingDetails = {
  date: '18 ABR 2027',
  venue: 'Pampulha - Belo Horizonte',
  time: '16h30',
  address: 'Av. Otacílio Negrão de Lima, 7630 - Pampulha, Belo Horizonte - MG, 31365-450',
  hostNames: 'Igor e Bianca',
};

// Limite da mensagem para o casal: cabe inteira no post-it mesmo em celulares pequenos.
// Conta caracteres "visíveis" (cada emoji vale 1), não unidades de código.
export const MESSAGE_MAX_LENGTH = 180;

export function messageLength(text: string) {
  return Array.from(text).length;
}

export function limitMessage(text: string) {
  return Array.from(text).slice(0, MESSAGE_MAX_LENGTH).join('');
}
