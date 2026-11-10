import { createHash } from 'node:crypto';

// Integração com o Cloudinary (fotos e vídeos do mural). O celular envia o arquivo direto para o Cloudinary
// com uma assinatura gerada aqui; o site só guarda no banco o identificador do arquivo (public_id).

export const MURAL_FOLDER = 'igor-bianca/mural';
export const MURAL_TAG = 'mural';

// Vídeos: já no envio o Cloudinary prepara uma versão MP4/H.264 (toca em qualquer aparelho, inclusive os vídeos
// HEVC do iPhone) e a capa em JPG. As URLs de exibição usam exatamente estas transformações.
const VIDEO_PLAYBACK = 'q_auto,vc_h264';
const VIDEO_POSTER = 'so_0,c_fill,g_auto,w_640,h_640,q_auto';
const VIDEO_EAGER = `${VIDEO_PLAYBACK}/mp4|${VIDEO_POSTER}/jpg`;

export type MediaKind = 'image' | 'video';

/**
 * Recorte de vídeo feito no editor do mural, em frações do quadro original ("x,y,w,h", de 0 a 1). Vira a
 * transformação c_crop do Cloudinary com valores relativos (decimais = proporção do vídeo).
 */
export function readVideoCrop(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const { x, y, w, h } = value as Record<string, unknown>;
  const numbers = [x, y, w, h].map(Number);
  if (numbers.some((n) => !Number.isFinite(n))) return null;
  const [cx, cy, cw, ch] = numbers;
  if (cw < 0.05 || ch < 0.05 || cw > 1 || ch > 1 || cx < 0 || cy < 0 || cx + cw > 1.0001 || cy + ch > 1.0001) return null;
  if (cw > 0.999 && ch > 0.999) return null;
  const f = (n: number) => Math.min(1, Math.max(0, n)).toFixed(4);
  return `${f(cx)},${f(cy)},${f(cw)},${f(ch)}`;
}

/** "x,y,w,h" → "c_crop,x_…,y_…,w_…,h_…/" (ou vazio, sem recorte). */
function cropTransform(crop: string | null | undefined) {
  if (!crop) return '';
  const [x, y, w, h] = crop.split(',');
  return `c_crop,x_${x},y_${y},w_${w},h_${h}/`;
}

function getConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? '';
  const apiKey = process.env.CLOUDINARY_API_KEY ?? '';
  const apiSecret = process.env.CLOUDINARY_API_SECRET ?? '';
  return { cloudName, apiKey, apiSecret, isConfigured: Boolean(cloudName && apiKey && apiSecret) };
}

export function isCloudinaryConfigured() {
  return getConfig().isConfigured;
}

/** Assinatura do Cloudinary: parâmetros em ordem alfabética, "chave=valor" unidos por "&", + segredo, em SHA-1. */
function sign(params: Record<string, string | number>) {
  const { apiSecret } = getConfig();
  const payload = Object.keys(params)
    .filter((key) => params[key] !== '' && params[key] !== undefined)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1').update(payload + apiSecret).digest('hex');
}

/** Dados para o celular enviar um arquivo direto ao Cloudinary (válidos por ~1 hora). */
export function createUploadSignature(kind: MediaKind, videoCrop: string | null = null) {
  const { cloudName, apiKey } = getConfig();
  const params: Record<string, string | number> = {
    folder: MURAL_FOLDER,
    tags: MURAL_TAG,
    timestamp: Math.floor(Date.now() / 1000),
  };
  if (kind === 'video') {
    // Com recorte, as versões preparadas no envio já saem recortadas (as mesmas URLs que o mural usa).
    const crop = cropTransform(videoCrop);
    params.eager = crop ? `${crop}${VIDEO_PLAYBACK}/mp4|${crop}${VIDEO_POSTER}/jpg` : VIDEO_EAGER;
    params.eager_async = 'true';
  }
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${kind}/upload`,
    apiKey,
    signature: sign(params),
    params,
  };
}

// Músicas do site (enviadas pelo painel). O Cloudinary trata áudio como "video".
export const MUSIC_FOLDER = 'igor-bianca/musicas';
export const MUSIC_TAG = 'musica';

/** Dados para o painel enviar uma música direto ao Cloudinary. */
export function createMusicUploadSignature() {
  const { cloudName, apiKey } = getConfig();
  const params: Record<string, string | number> = { folder: MUSIC_FOLDER, tags: MUSIC_TAG, timestamp: Math.floor(Date.now() / 1000) };
  return { uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, apiKey, signature: sign(params), params };
}

/** Endereço de uma música enviada, sempre em MP3 (o Cloudinary converte outros formatos de áudio). */
export function musicUrl(publicId: string) {
  const { cloudName } = getConfig();
  return `https://res.cloudinary.com/${cloudName}/video/upload/${publicId}.mp3`;
}

/** Confere que o arquivo informado foi mesmo enviado ao nosso Cloudinary (assinatura devolvida no envio). */
export function verifyUploadResponse(publicId: string, version: string | number, signature: string, folder: string = MURAL_FOLDER) {
  if (!publicId.startsWith(`${folder}/`)) return false;
  const { apiSecret } = getConfig();
  const expected = createHash('sha1').update(`public_id=${publicId}&version=${version}${apiSecret}`).digest('hex');
  return expected === signature;
}

/** URLs de exibição de um arquivo do mural. */
export function mediaUrls(kind: MediaKind, publicId: string, videoCrop: string | null = null) {
  const { cloudName } = getConfig();
  const base = `https://res.cloudinary.com/${cloudName}/${kind}/upload`;
  if (kind === 'video') {
    const crop = cropTransform(videoCrop);
    return {
      thumb: `${base}/${crop}${VIDEO_POSTER}/${publicId}.jpg`,
      full: `${base}/${crop}${VIDEO_PLAYBACK}/${publicId}.mp4`,
      poster: `${base}/${crop}so_0,c_limit,w_1600,q_auto/${publicId}.jpg`,
    };
  }
  return {
    thumb: `${base}/f_auto,q_auto,c_fill,g_auto,w_640,h_640/${publicId}`,
    full: `${base}/f_auto,q_auto,c_limit,w_1800/${publicId}`,
    poster: null,
  };
}

/** Apaga um arquivo do Cloudinary (ao excluir um post). */
export async function destroyMedia(kind: MediaKind, publicId: string) {
  const { cloudName, apiKey } = getConfig();
  const params = { invalidate: 'true', public_id: publicId, timestamp: Math.floor(Date.now() / 1000) };
  const body = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), api_key: apiKey, signature: sign(params) });
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${kind}/destroy`, { method: 'POST', body });
  const data = await response.json().catch(() => null);
  return response.ok && (data?.result === 'ok' || data?.result === 'not found');
}

/** Link assinado que baixa um .zip com todas as fotos (ou todos os vídeos) do mural. */
export function archiveDownloadUrl(kind: MediaKind) {
  const { cloudName, apiKey } = getConfig();
  const params: Record<string, string | number> = {
    flatten_folders: 'true',
    mode: 'download',
    tags: MURAL_TAG,
    target_public_id: kind === 'image' ? 'mural-igor-bianca-fotos' : 'mural-igor-bianca-videos',
    timestamp: Math.floor(Date.now() / 1000),
  };
  const query = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    api_key: apiKey,
    signature: sign(params),
  });
  return `https://api.cloudinary.com/v1_1/${cloudName}/${kind}/generate_archive?${query.toString()}`;
}
