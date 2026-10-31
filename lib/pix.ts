// Gera o "Pix copia e cola" (BR Code estático do Banco Central) com o valor já preenchido.
// O dinheiro cai direto na conta da chave configurada, sem intermediário e sem taxa.
// Configuração por variáveis de ambiente: PIX_KEY, PIX_RECEIVER_NAME e PIX_RECEIVER_CITY.

function field(id: string, value: string) {
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

// CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF), exigido no campo 63 do BR Code.
function crc16(payload: string) {
  let crc = 0xffff;
  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Nome e cidade do recebedor: sem acentos, maiúsculos e dentro do tamanho máximo do padrão.
function normalize(value: string, maxLength: number) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .trim()
    .toUpperCase()
    .slice(0, maxLength);
}

export type PixConfig = { key: string; receiverName: string; receiverCity: string };

export function getPixConfig(): PixConfig | null {
  const key = process.env.PIX_KEY?.trim();
  const receiverName = process.env.PIX_RECEIVER_NAME?.trim();
  const receiverCity = process.env.PIX_RECEIVER_CITY?.trim();
  if (!key || !receiverName || !receiverCity) return null;
  return { key, receiverName, receiverCity };
}

/** Monta o código para um valor em centavos; `reference` identifica o pagamento no extrato (até 25 letras/números). */
export function buildPixPayload(config: PixConfig, amountCents: number, reference: string) {
  const merchantAccount = field('00', 'br.gov.bcb.pix') + field('01', config.key);
  const txid = reference.replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';

  const payload =
    field('00', '01') +
    field('26', merchantAccount) +
    field('52', '0000') +
    field('53', '986') +
    field('54', (amountCents / 100).toFixed(2)) +
    field('58', 'BR') +
    field('59', normalize(config.receiverName, 25)) +
    field('60', normalize(config.receiverCity, 15)) +
    field('62', field('05', txid)) +
    '6304';

  return payload + crc16(payload);
}
