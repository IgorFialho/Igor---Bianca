"use client";

import { INVITE_ACCESS_KEY, INVITE_REMEMBER_KEY } from '@/lib/invite';

// Funções do mural que rodam no navegador: código do convite, compressão de fotos e envio ao Cloudinary.

export const MURAL_CODE_KEY = INVITE_REMEMBER_KEY;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

/** Noivo/noiva logados no painel: os posts deles saem em destaque. */
export type MuralAuthorRole = 'noivo' | 'noiva';
export type MuralAdminView = { role: MuralAuthorRole; name: string };

/** Uma foto/vídeo de um post com várias (carrossel). */
export type MuralMediaItemView = {
  mediaType: 'image' | 'video';
  thumbUrl: string;
  fullUrl: string;
  posterUrl: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  cardFocus: number;
};

/** Máximo de fotos/vídeos num post (igual ao servidor). */
export const MAX_MEDIA_PER_POST = 10;

export type MuralPostView = {
  /** Todas as mídias do post (a 1ª é a do próprio post); mais de uma = carrossel. */
  media?: MuralMediaItemView[];
  id: string;
  authorName: string;
  authorRole: MuralAuthorRole | null;
  caption: string | null;
  mediaType: 'image' | 'video';
  thumbUrl: string;
  fullUrl: string;
  posterUrl: string | null;
  width: number | null;
  /** Parte da mídia que aparece no card quando ele corta (0 a 1; 0.5 = centro). */
  cardFocus?: number;
  height: number | null;
  duration: number | null;
  createdAt: string;
  likes: number;
  comments: number;
  likedByMe: boolean;
  isMine: boolean;
  isHidden: boolean;
  /** Segundos que ainda faltam para o autor poder apagar (0 = não pode mais / não é dele). */
  deleteSecondsLeft: number;
};

export type MuralCommentView = {
  id: string;
  postId: string;
  authorName: string;
  authorRole: MuralAuthorRole | null;
  text: string;
  createdAt: string;
  isMine: boolean;
  isHidden: boolean;
  deleteSecondsLeft: number;
  /** Curtidas do comentário e se este aparelho curtiu. */
  likes?: number;
  likedByMe?: boolean;
};

export type MuralSettingsView = {
  isOpen: boolean;
  manualOpen: boolean;
  opensAt: string | null;
  /** Horário agendado para fechar sozinho. */
  closesAt: string | null;
  /** Já passou do horário de fechar. */
  isClosedBySchedule: boolean;
  uploadsReady: boolean;
};

/** Código do convite já usado neste aparelho (do convite ou do próprio mural). */
export function readStoredCode() {
  try {
    return window.localStorage.getItem(MURAL_CODE_KEY) || window.sessionStorage.getItem(INVITE_ACCESS_KEY) || '';
  } catch {
    return '';
  }
}

export function storeCode(code: string) {
  try {
    window.localStorage.setItem(MURAL_CODE_KEY, code);
    window.sessionStorage.setItem(INVITE_ACCESS_KEY, code);
  } catch {
    // Sem armazenamento (ex.: navegação privada): o código vale só enquanto a página estiver aberta.
  }
}

const VIEWER_ID_KEY = 'igor-bianca-mural-viewer';
const AUTHOR_NAME_KEY = 'igor-bianca-mural-name';

/**
 * Identificador aleatório deste aparelho (criado uma vez e guardado só nele). O mural é aberto, sem login:
 * ele serve para curtir uma vez, apagar os próprios posts/comentários e marcar "meus posts".
 */
export function getViewerId() {
  try {
    const saved = window.localStorage.getItem(VIEWER_ID_KEY);
    if (saved && /^[A-Za-z0-9-]{16,64}$/.test(saved)) return saved;
  } catch {
    // Sem armazenamento: um identificador por visita.
  }
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  try {
    window.localStorage.setItem(VIEWER_ID_KEY, id);
  } catch {
    // ignora
  }
  return id;
}

/** Nome de quem publica/comenta, lembrado neste aparelho. */
export function readAuthorName() {
  try {
    return window.localStorage.getItem(AUTHOR_NAME_KEY) || '';
  } catch {
    return '';
  }
}

export function storeAuthorName(name: string) {
  try {
    window.localStorage.setItem(AUTHOR_NAME_KEY, name.trim());
  } catch {
    // ignora
  }
}

export function forgetCode() {
  try {
    window.localStorage.removeItem(MURAL_CODE_KEY);
  } catch {
    // ignora
  }
}

/** "agora", "há 5 min", "há 2 h", "ontem", "12/04". */
export function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'agora';
  if (seconds < 3600) return `há ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `há ${Math.floor(seconds / 3600)} h`;
  if (seconds < 172800) return 'ontem';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function initials(name: string) {
  const parts = name.replace(/\s+e\s+/i, ' ').split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '♥';
}

/**
 * Reduz a foto no próprio celular (lado maior até 2048 px, JPEG ~85%) antes de enviar: uma foto de 8 MB vira ~500 KB.
 * Se o navegador não conseguir ler o formato (ex.: HEIC no Chrome), envia o arquivo original.
 */
/** Lê a foto para desenhar no canvas. Navegadores mais antigos (ex.: Safari < 15) não aceitam as opções de
 * createImageBitmap ou nem têm a função: nesses casos, tenta sem opções e, por fim, por um elemento <img>. */
async function decodeImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    for (const options of [{ imageOrientation: 'from-image' } as ImageBitmapOptions, undefined]) {
      try {
        const bitmap = options ? await createImageBitmap(file, options) : await createImageBitmap(file);
        return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close?.() };
      } catch {
        // tenta a próxima forma
      }
    }
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  await image.decode();
  return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
}

export async function compressImage(file: File): Promise<{ blob: Blob; width: number | null; height: number | null }> {
  try {
    const decoded = await decodeImage(file);
    const scale = Math.min(1, 2048 / Math.max(decoded.width, decoded.height));
    const width = Math.round(decoded.width * scale);
    const height = Math.round(decoded.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas');
    context.drawImage(decoded.source, 0, 0, width, height);
    decoded.release();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('toBlob');
    return { blob: blob.size < file.size ? blob : file, width, height };
  } catch {
    return { blob: file, width: null, height: null };
  }
}

/** Duração e tamanho de um vídeo escolhido (para mostrar e validar antes de enviar). */
export function readVideoMeta(file: File): Promise<{ duration: number | null; width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    const done = (meta: { duration: number | null; width: number | null; height: number | null }) => {
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    video.onloadedmetadata = () =>
      done({
        duration: Number.isFinite(video.duration) ? video.duration : null,
        width: video.videoWidth || null,
        height: video.videoHeight || null,
      });
    video.onerror = () => done({ duration: null, width: null, height: null });
    video.src = url;
  });
}

type UploadSignature = { uploadUrl: string; apiKey: string; signature: string; params: Record<string, string | number> };
export type UploadResult = { public_id: string; version: number; signature: string; resource_type: string; width?: number; height?: number; duration?: number };

/** Envia o arquivo direto ao Cloudinary, informando o progresso (0 a 1). */
export function uploadToCloudinary(file: Blob, fileName: string, sign: UploadSignature, onProgress: (fraction: number) => void) {
  return new Promise<UploadResult>((resolve, reject) => {
    const form = new FormData();
    form.append('file', file, fileName);
    form.append('api_key', sign.apiKey);
    form.append('signature', sign.signature);
    Object.entries(sign.params).forEach(([key, value]) => form.append(key, String(value)));

    const request = new XMLHttpRequest();
    request.open('POST', sign.uploadUrl);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      try {
        const data = JSON.parse(request.responseText);
        if (request.status >= 200 && request.status < 300 && data?.public_id) resolve(data);
        else reject(new Error(data?.error?.message ? 'O arquivo não foi aceito. Tente outro.' : 'Falha no envio.'));
      } catch {
        reject(new Error('Falha no envio.'));
      }
    };
    request.onerror = () => reject(new Error('Sem conexão. Verifique a internet e tente de novo.'));
    request.send(form);
  });
}
