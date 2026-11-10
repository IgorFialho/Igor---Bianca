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
export function createUploadSignature(kind: MediaKind) {
  const { cloudName, apiKey } = getConfig();
  const params: Record<string, string | number> = {
    folder: MURAL_FOLDER,
    tags: MURAL_TAG,
    timestamp: Math.floor(Date.now() / 1000),
  };
  if (kind === 'video') {
    params.eager = VIDEO_EAGER;
    params.eager_async = 'true';
  }
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${kind}/upload`,
    apiKey,
    signature: sign(params),
    params,
  };
}

/** Confere que o arquivo informado foi mesmo enviado ao nosso Cloudinary (assinatura devolvida no envio). */
export function verifyUploadResponse(publicId: string, version: string | number, signature: string) {
  if (!publicId.startsWith(`${MURAL_FOLDER}/`)) return false;
  const { apiSecret } = getConfig();
  const expected = createHash('sha1').update(`public_id=${publicId}&version=${version}${apiSecret}`).digest('hex');
  return expected === signature;
}

/** URLs de exibição de um arquivo do mural. */
export function mediaUrls(kind: MediaKind, publicId: string) {
  const { cloudName } = getConfig();
  const base = `https://res.cloudinary.com/${cloudName}/${kind}/upload`;
  if (kind === 'video') {
    return {
      thumb: `${base}/${VIDEO_POSTER}/${publicId}.jpg`,
      full: `${base}/${VIDEO_PLAYBACK}/${publicId}.mp4`,
      poster: `${base}/so_0,c_limit,w_1600,q_auto/${publicId}.jpg`,
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
