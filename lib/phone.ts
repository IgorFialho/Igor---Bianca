// Telefones brasileiros: o banco guarda só os dígitos (com DDD; às vezes com 55 na frente) e a tela mostra formatado.

/** Mostra o telefone formatado: (31) 99999-9999, (31) 3333-4444 ou +55 (31) 99999-9999. */
export function formatPhone(digits: string | null | undefined) {
  if (!digits) return '';
  const value = digits.replace(/\D/g, '');
  const withCountry = value.length > 11 && value.startsWith('55');
  const local = withCountry ? value.slice(2) : value;
  if (local.length < 10) return value;
  const ddd = local.slice(0, 2);
  const number = local.slice(2);
  const split = number.length === 9 ? 5 : 4;
  const formatted = `(${ddd}) ${number.slice(0, split)}-${number.slice(split)}`;
  return withCountry ? `+55 ${formatted}` : formatted;
}

/** Máscara enquanto a pessoa digita: (31) 9 → (31) 99999-9999. */
export function maskPhoneInput(raw: string) {
  const value = raw.replace(/\D/g, '').slice(0, 11);
  if (value.length === 0) return '';
  if (value.length <= 2) return `(${value}`;
  const ddd = value.slice(0, 2);
  const number = value.slice(2);
  if (number.length <= 4) return `(${ddd}) ${number}`;
  const split = number.length >= 9 ? 5 : 4;
  return `(${ddd}) ${number.slice(0, split)}-${number.slice(split)}`;
}

/** Link do WhatsApp para o número (assume Brasil quando não vem com 55). */
export function whatsappLink(digits: string | null | undefined) {
  if (!digits) return null;
  const value = digits.replace(/\D/g, '');
  if (value.length < 10) return null;
  return `https://wa.me/${value.length > 11 && value.startsWith('55') ? value : `55${value}`}`;
}
