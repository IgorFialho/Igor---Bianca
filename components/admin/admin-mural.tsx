"use client";

import { AnimatePresence } from 'framer-motion';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog, type ConfirmRequest } from '@/components/admin/confirm-dialog';
import { Composer } from '@/components/mural/mural-feed';
import { EmojiPicker } from '@/components/emoji-picker';
import { DEFAULT_PHOTO_EDIT, PhotoEditor, type PhotoEditResult, type VideoCrop, type VideoCropResult } from '@/components/mural/photo-editor';
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  compressImage,
  getViewerId,
  readVideoMeta,
  timeAgo,
  uploadToCloudinary,
  type MuralAdminView,
  type MuralPostView,
  type MuralSettingsView,
} from '@/components/mural/mural-client';

const CARD = 'rounded-[2rem] border border-zinc-800/10 bg-[#fffaf1] p-6 shadow-[0_24px_60px_rgba(47,36,27,0.08)] sm:p-8';
const EYEBROW = 'text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70';
const FIELD =
  'w-full rounded-xl border border-zinc-800/15 bg-cream px-5 py-3 text-sm text-zinc-800 focus:border-champagne-600 focus:outline-none focus:ring-2 focus:ring-champagne-600/20';
const BUTTON = 'inline-flex items-center justify-center rounded-full px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] transition-colors disabled:cursor-not-allowed disabled:opacity-60';
// No iPhone o campo de data tem largura mínima própria e estoura o card: força caber e alinha o texto à esquerda.
const DATE_FIELD = `${FIELD} block min-w-0 max-w-full appearance-none min-h-[46px] text-left [&::-webkit-date-and-time-value]:text-left`;
const PRIMARY = `${BUTTON} bg-champagne-600 text-[#fff9f1] hover:opacity-90`;
const SECONDARY = `${BUTTON} border border-zinc-800/20 text-zinc-800 hover:bg-zinc-800/5`;
const DANGER = `${BUTTON} border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100`;
const SMALL = 'rounded-full border px-3 py-1 text-xs font-medium transition-colors';

type AdminComment = { id: string; postId: string; authorName: string; authorRole: 'noivo' | 'noiva' | null; text: string; isHidden: boolean; createdAt: string };
type EditingPost = { id: string; authorName: string; caption: string; thumbUrl: string; fullUrl: string; mediaType: 'image' | 'video'; cardFocus?: number };

/** Foto/vídeo novo escolhido na edição (ainda não enviado). */
type NewMedia = {
  kind: 'image' | 'video';
  /** O que vai ser enviado (foto já editada, ou o vídeo original). */
  upload: Blob;
  fileName: string;
  previewUrl: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  crop: VideoCrop | null;
  /** Parte que aparece no card do mural (escolhida no editor). */
  focus?: number;
};

export type EditPostSave = { authorName: string; caption: string; media: Record<string, unknown> | null };

const CAPTION_LIMIT = 300;

/**
 * Janela de editar um post do mural: nome, legenda e também a foto/vídeo. "Editar foto" abre a foto atual no
 * editor (enquadrar e texto); "Trocar foto ou vídeo" escolhe outro arquivo (que também passa pelo editor).
 * Ao salvar, o arquivo novo é enviado ao Cloudinary e substitui o antigo, mantendo curtidas e comentários.
 */
function EditPostDialog({
  post,
  adminName,
  onClose,
  onSave,
}: {
  post: EditingPost;
  adminName: string;
  onClose: () => void;
  onSave: (data: EditPostSave) => Promise<void>;
}) {
  const [authorName, setAuthorName] = useState(post.authorName);
  const [caption, setCaption] = useState(post.caption);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  /** Emoji na legenda: entra onde está o cursor (sem passar do limite). */
  const insertCaptionEmoji = (emoji: string) => {
    const field = captionRef.current;
    const start = field?.selectionStart ?? caption.length;
    const end = field?.selectionEnd ?? caption.length;
    const next = caption.slice(0, start) + emoji + caption.slice(end);
    if (next.length > CAPTION_LIMIT) return;
    setCaption(next);
    window.requestAnimationFrame(() => {
      if (!field) return;
      const caret = start + emoji.length;
      field.focus();
      field.setSelectionRange(caret, caret);
    });
  };
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [media, setMedia] = useState<NewMedia | null>(null);
  // Arquivo aberto no editor agora (foto atual baixada, ou o arquivo novo escolhido).
  const [editorFile, setEditorFile] = useState<{ file: File; kind: 'image' | 'video'; duration: number | null } | null>(null);
  const [isLoadingPhoto, setIsLoadingPhoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving && !editorFile) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSaving, editorFile, onClose]);

  useEffect(() => () => {
    if (media) URL.revokeObjectURL(media.previewUrl);
  }, [media]);

  /** Baixa a foto atual (em JPG, até 1800 px) para abrir no editor. */
  const editCurrentPhoto = async () => {
    setError('');
    setIsLoadingPhoto(true);
    try {
      const url = post.fullUrl.replace('/f_auto,', '/f_jpg,');
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      setEditorFile({ file: new File([blob], 'foto.jpg', { type: 'image/jpeg' }), kind: 'image', duration: null });
    } catch {
      setError('Não foi possível abrir a foto atual. Tente "Trocar foto ou vídeo".');
    } finally {
      setIsLoadingPhoto(false);
    }
  };

  const pickNewFile = async (file: File | undefined) => {
    setError('');
    if (!file) return;
    const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name) ? 'image' : null;
    if (!kind) {
      setError('Escolha uma foto ou um vídeo.');
      return;
    }
    if (kind === 'video' && file.size > MAX_VIDEO_BYTES) {
      setError('Vídeo muito grande (máximo 100 MB).');
      return;
    }
    const duration = kind === 'video' ? (await readVideoMeta(file)).duration : null;
    setEditorFile({ file, kind, duration });
  };

  const closeEditor = useCallback(() => setEditorFile(null), []);
  const editorUnsupported = useCallback(() => {
    // Não abriu no editor (ex.: HEIC no Chrome): usa o arquivo como está.
    setEditorFile((current) => {
      if (current) {
        setMedia({
          kind: current.kind,
          upload: current.file,
          fileName: current.file.name || 'arquivo',
          previewUrl: URL.createObjectURL(current.file),
          width: null,
          height: null,
          duration: current.duration,
          crop: null,
        });
      }
      return null;
    });
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (authorName.trim().length < 2) {
      setError('Informe um nome com pelo menos 2 letras.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      let uploaded: Record<string, unknown> | null = null;
      if (media) {
        // Envia o arquivo novo ao Cloudinary (mesmo caminho das postagens; o painel pode enviar com o mural fechado).
        setProgress(0);
        let upload = media.upload;
        let width = media.width;
        let height = media.height;
        if (media.kind === 'image') {
          const compressed = await compressImage(upload instanceof File ? upload : new File([upload], 'foto.jpg', { type: 'image/jpeg' }));
          upload = compressed.blob;
          width = compressed.width ?? width;
          height = compressed.height ?? height;
          if (upload.size > MAX_IMAGE_BYTES) throw new Error('Foto muito grande (máximo 10 MB).');
        }
        const signResponse = await fetch('/api/mural/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ viewerId: getViewerId(), name: adminName, kind: media.kind, crop: media.crop ?? undefined }),
        });
        const sign = await signResponse.json();
        if (!signResponse.ok) throw new Error(sign?.error || 'Não foi possível preparar o envio.');
        const result = await uploadToCloudinary(upload, media.kind === 'image' ? 'foto.jpg' : media.fileName, sign, setProgress);
        uploaded = {
          publicId: result.public_id,
          version: result.version,
          signature: result.signature,
          resourceType: result.resource_type,
          width: media.crop ? width : (result.width ?? width),
          height: media.crop ? height : (result.height ?? height),
          duration: result.duration ?? media.duration,
          crop: media.crop ?? undefined,
          focus: media.focus ?? post.cardFocus ?? 0.5,
        };
      }
      await onSave({ authorName: authorName.trim(), caption: caption.trim(), media: uploaded });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar.');
    } finally {
      setIsSaving(false);
      setProgress(null);
    }
  };

  const previewIsVideo = media ? media.kind === 'video' : false;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-post-title"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm"
      onClick={() => (isSaving || editorFile ? undefined : onClose())}
    >
      <form
        onSubmit={save}
        className="max-h-[92svh] w-full max-w-md overflow-y-auto rounded-[2rem] border border-zinc-800/10 bg-[#fffaf1] p-6 shadow-2xl sm:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <p className={EYEBROW}>Mural</p>
        <h3 id="edit-post-title" className="mt-2 font-display text-4xl italic leading-none text-zinc-800">
          Editar post
        </h3>

        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(event) => {
            void pickNewFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <div className="mt-5 flex items-start gap-3">
          <div className="safari-clip relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-black">
            {media ? (
              previewIsVideo ? (
                <video
                  src={media.previewUrl}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="absolute max-w-none object-fill"
                  style={
                    media.crop
                      ? {
                          width: `${100 / media.crop.w}%`,
                          height: `${100 / media.crop.h}%`,
                          left: `${(-media.crop.x / media.crop.w) * 100}%`,
                          top: `${(-media.crop.y / media.crop.h) * 100}%`,
                        }
                      : { inset: 0, width: '100%', height: '100%', objectFit: 'cover' }
                  }
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media.previewUrl} alt="" className="h-full w-full object-cover" />
              )
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.thumbUrl} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
            {media ? <p className="text-xs font-medium text-olive-800">Novo arquivo pronto: será publicado ao salvar.</p> : null}
            {post.mediaType === 'image' && !media ? (
              <button type="button" onClick={editCurrentPhoto} disabled={isSaving || isLoadingPhoto} className={`${SMALL} border-zinc-800/20 text-zinc-800 hover:bg-zinc-800/5`}>
                {isLoadingPhoto ? 'Abrindo…' : 'Editar foto'}
              </button>
            ) : null}
            {media && media.kind === 'image' ? (
              <button
                type="button"
                onClick={() => setEditorFile({ file: media.upload instanceof File ? media.upload : new File([media.upload], 'foto.jpg', { type: 'image/jpeg' }), kind: 'image', duration: null })}
                disabled={isSaving}
                className={`${SMALL} border-zinc-800/20 text-zinc-800 hover:bg-zinc-800/5`}
              >
                Editar de novo
              </button>
            ) : null}
            <button type="button" onClick={() => fileRef.current?.click()} disabled={isSaving} className={`${SMALL} border-zinc-800/20 text-zinc-800 hover:bg-zinc-800/5`}>
              Trocar foto ou vídeo
            </button>
            {media ? (
              <button type="button" onClick={() => setMedia(null)} disabled={isSaving} className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-800">
                Manter o arquivo atual
              </button>
            ) : null}
          </div>
        </div>

        <label htmlFor="edit-post-name" className={`${EYEBROW} mt-5 block`}>
          Nome de quem postou
        </label>
        <input id="edit-post-name" value={authorName} onChange={(event) => setAuthorName(event.target.value)} maxLength={60} disabled={isSaving} className={`${FIELD} mt-2`} />
        <label htmlFor="edit-post-caption" className={`${EYEBROW} mt-4 block`}>
          Legenda
        </label>
        <div className="relative mt-2">
          <textarea
            ref={captionRef}
            id="edit-post-caption"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            maxLength={CAPTION_LIMIT}
            rows={3}
            disabled={isSaving}
            placeholder="Sem legenda"
            className={`${FIELD} resize-none rounded-2xl pr-14`}
          />
          <div className="absolute bottom-2.5 right-2.5">
            <EmojiPicker onSelect={insertCaptionEmoji} disabled={isSaving} />
          </div>
        </div>
        <p className="mt-1 text-right text-xs text-zinc-500">
          {caption.length}/{CAPTION_LIMIT}
        </p>
        {progress !== null ? (
          <div className="mt-2" aria-live="polite">
            <div className="flex justify-between text-xs text-zinc-600">
              <span>Enviando o arquivo…</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-800/10">
              <div className="h-full rounded-full bg-champagne-600 transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>
        ) : null}
        {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={isSaving} className={SECONDARY}>
            Cancelar
          </button>
          <button type="submit" disabled={isSaving} className={PRIMARY}>
            {isSaving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>

      {editorFile ? (
        <PhotoEditor
          file={editorFile.file}
          kind={editorFile.kind}
          // Começa com a parte do card que o post já usa.
          initialState={{ ...DEFAULT_PHOTO_EDIT, muralFocus: media?.focus ?? post.cardFocus ?? 0.5 }}
          onCancel={closeEditor}
          onDone={(result: PhotoEditResult) => {
            setMedia({
              kind: 'image',
              upload: new File([result.blob], 'foto.jpg', { type: 'image/jpeg' }),
              fileName: 'foto.jpg',
              previewUrl: URL.createObjectURL(result.blob),
              width: result.width,
              height: result.height,
              duration: null,
              crop: null,
              focus: result.state.muralFocus,
            });
            setEditorFile(null);
          }}
          onCropDone={(result: VideoCropResult) => {
            const current = editorFile;
            setMedia({
              kind: 'video',
              upload: current.file,
              fileName: current.file.name || 'video.mp4',
              previewUrl: URL.createObjectURL(current.file),
              width: result.width,
              height: result.height,
              duration: current.duration,
              crop: result.crop,
              focus: result.state.muralFocus,
            });
            setEditorFile(null);
          }}
          onUnsupported={editorUnsupported}
        />
      ) : null}
    </div>
  );
}

/** ISO → valor do campo datetime-local (horário do aparelho). */
function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Aba "Mural" do painel: abrir/fechar/agendar a postagem, moderar posts e comentários e baixar tudo.
export function AdminMural() {
  const [settings, setSettings] = useState<MuralSettingsView | null>(null);
  const [posts, setPosts] = useState<MuralPostView[]>([]);
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [opensAtInput, setOpensAtInput] = useState('');
  const [closesAtInput, setClosesAtInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmRequest | null>(null);
  const closeConfirm = useCallback(() => setConfirmAction(null), []);
  // Quem está no painel (noivo ou noiva) e a janela de publicar no mural.
  const [admin, setAdmin] = useState<MuralAdminView | null>(null);
  const [composerViewerId, setComposerViewerId] = useState<string | null>(null);
  // Post sendo editado (nome de quem postou e legenda).
  const [editingPost, setEditingPost] = useState<EditingPost | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/mural', { cache: 'no-store' });
      if (response.status === 401) {
        window.location.href = '/admin/login';
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Erro ao carregar o mural.');
      setSettings(data.settings);
      setPosts(data.posts);
      setComments(data.comments);
      setAdmin(data.admin ?? null);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar o mural.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => document.visibilityState === 'visible' && load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    setOpensAtInput(toLocalInput(settings?.opensAt ?? null));
  }, [settings?.opensAt]);

  useEffect(() => {
    setClosesAtInput(toLocalInput(settings?.closesAt ?? null));
  }, [settings?.closesAt]);

  const request = async (method: 'PATCH' | 'DELETE', body: Record<string, unknown>) => {
    const response = await fetch('/api/admin/mural', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || 'Não foi possível concluir.');
    return data;
  };

  const saveSettings = async (manualOpen: boolean, opensAt: string, closesAt: string, done: string) => {
    setIsSaving(true);
    setError('');
    try {
      const data = await request('PATCH', {
        action: 'settings',
        manualOpen,
        opensAt: opensAt ? new Date(opensAt).toISOString() : '',
        closesAt: closesAt ? new Date(closesAt).toISOString() : '',
      });
      setSettings(data.settings);
      setMessage(done);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar.');
    } finally {
      setIsSaving(false);
    }
  };

  const run = async (action: () => Promise<unknown>, done: string) => {
    setError('');
    try {
      await action();
      setMessage(done);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível concluir.');
    }
  };

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 3500);
    return () => window.clearTimeout(timer);
  }, [message]);

  const photos = posts.filter((post) => post.mediaType === 'image').length;
  const videos = posts.length - photos;
  const totalLikes = posts.reduce((sum, post) => sum + post.likes, 0);
  const postById = new Map(posts.map((post) => [post.id, post]));
  const formatDateTime = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
  const opensAtLabel = formatDateTime(settings?.opensAt);
  const closesAtLabel = formatDateTime(settings?.closesAt);
  const closeNote = closesAtLabel && !settings?.isClosedBySchedule ? ` Fecha automaticamente em ${closesAtLabel}.` : '';

  const stats = [
    { label: 'Posts', value: posts.length },
    { label: 'Fotos', value: photos },
    { label: 'Vídeos', value: videos },
    { label: 'Curtidas', value: totalLikes },
    { label: 'Comentários', value: comments.length },
  ];

  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-4xl leading-none text-zinc-800">Mural do casamento</h2>
          <p className="mt-2 text-sm text-zinc-600">Fotos e vídeos que os convidados postam. Aparecem na hora; aqui vocês ocultam ou excluem.</p>
          {admin ? (
            <p className="mt-1 text-sm text-zinc-600">
              Os posts que você publicar aqui saem em destaque, como {admin.role === 'noivo' ? 'noivo' : 'noiva'} ({admin.name}), mesmo com o mural
              fechado para os convidados.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {admin && settings?.uploadsReady ? (
            <button type="button" onClick={() => setComposerViewerId(getViewerId())} className={PRIMARY}>
              Publicar foto ou vídeo
            </button>
          ) : null}
          <a href="/mural" target="_blank" rel="noopener noreferrer" className={SECONDARY}>
            Abrir o mural
          </a>
          <a href="/mural/telao" target="_blank" rel="noopener noreferrer" className={SECONDARY}>
            Abrir o telão
          </a>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-olive-800">{message}</p> : null}
      {isLoading ? <p className="mt-6 text-sm text-zinc-600">Carregando…</p> : null}

      {settings ? (
        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-5 rounded-2xl border border-zinc-800/10 bg-cream p-5">
            <div className="flex items-center justify-between gap-3">
              <p className={EYEBROW}>Postagem</p>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  settings.isOpen ? 'border-olive-300/70 bg-olive-50 text-olive-800' : 'border-zinc-800/15 bg-[#f6edd7] text-zinc-700'
                }`}
              >
                {settings.isOpen ? 'Aberta' : 'Fechada'}
              </span>
            </div>
            <p className="text-sm text-zinc-700">
              {settings.isClosedBySchedule
                ? `Encerrada automaticamente em ${closesAtLabel}. Os convidados veem o mural, mas não postam mais.`
                : settings.isOpen
                  ? (settings.manualOpen ? 'Aberta pelo botão: os convidados já podem postar, curtir e comentar.' : `Abriu automaticamente em ${opensAtLabel}.`) + closeNote
                  : opensAtLabel
                    ? `Abre automaticamente em ${opensAtLabel}.` + closeNote
                    : 'Fechada: os convidados veem o mural, mas não postam.'}
            </p>
            {!settings.uploadsReady ? <p className="text-xs text-rose-700">Cloudinary não configurado neste ambiente: o envio de arquivos não funciona.</p> : null}

            <div className="flex flex-wrap gap-2">
              {settings.isOpen ? (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() =>
                    setConfirmAction({
                      title: 'Fechar o mural',
                      message: 'Os convidados deixam de postar, curtir e comentar (o que já foi postado continua visível). Os horários agendados de abrir e fechar também são removidos.',
                      confirmLabel: 'Fechar',
                      tone: 'danger',
                      onConfirm: () => saveSettings(false, '', '', 'Mural fechado.'),
                    })
                  }
                  className={DANGER}
                >
                  Fechar agora
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() =>
                    setConfirmAction({
                      title: 'Abrir o mural',
                      message: 'Os convidados passam a poder postar fotos e vídeos, curtir e comentar.',
                      confirmLabel: 'Abrir',
                      onConfirm: () => saveSettings(true, opensAtInput, closesAtInput, 'Mural aberto.'),
                    })
                  }
                  className={PRIMARY}
                >
                  Abrir agora
                </button>
              )}
            </div>

            <div className="space-y-3 border-t border-zinc-800/10 pt-5">
              <p className={EYEBROW}>Agendamento</p>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <div className="min-w-0 space-y-1.5">
                  <label htmlFor="mural-opens-at" className="text-xs text-zinc-600">
                    Abrir automaticamente em
                  </label>
                  <input id="mural-opens-at" type="datetime-local" value={opensAtInput} onChange={(event) => setOpensAtInput(event.target.value)} className={DATE_FIELD} />
                  {opensAtInput ? (
                    <button type="button" onClick={() => setOpensAtInput('')} className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-800">
                      limpar
                    </button>
                  ) : null}
                </div>
                <div className="min-w-0 space-y-1.5">
                  <label htmlFor="mural-closes-at" className="text-xs text-zinc-600">
                    Fechar automaticamente em
                  </label>
                  <input id="mural-closes-at" type="datetime-local" value={closesAtInput} min={opensAtInput || undefined} onChange={(event) => setClosesAtInput(event.target.value)} className={DATE_FIELD} />
                  {closesAtInput ? (
                    <button type="button" onClick={() => setClosesAtInput('')} className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-800">
                      limpar
                    </button>
                  ) : null}
                </div>
              </div>
              <p className="text-xs text-zinc-600">Ao fechar, os posts continuam visíveis, mas ninguém mais posta, curte ou comenta.</p>
              <button
                type="button"
                disabled={isSaving || (opensAtInput === toLocalInput(settings.opensAt) && closesAtInput === toLocalInput(settings.closesAt))}
                onClick={() =>
                  saveSettings(
                    settings.manualOpen,
                    opensAtInput,
                    closesAtInput,
                    opensAtInput || closesAtInput ? 'Agendamento salvo.' : 'Agendamento removido.'
                  )
                }
                className={SECONDARY}
              >
                Salvar agendamento
              </button>
            </div>

            <div className="space-y-2 border-t border-zinc-800/10 pt-5">
              <p className={EYEBROW}>Baixar tudo</p>
              <p className="text-xs text-zinc-600">Gera um arquivo .zip com os arquivos originais enviados ao mural (inclusive os ocultos).</p>
              <div className="flex flex-wrap gap-2">
                <a href="/api/admin/mural/download?type=image" className={`${SECONDARY} ${photos === 0 ? 'pointer-events-none opacity-50' : ''}`}>
                  Fotos (.zip)
                </a>
                <a href="/api/admin/mural/download?type=video" className={`${SECONDARY} ${videos === 0 ? 'pointer-events-none opacity-50' : ''}`}>
                  Vídeos (.zip)
                </a>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-zinc-800/10 bg-cream px-4 py-3">
                  <p className="text-[0.62rem] font-medium uppercase tracking-[0.16em] text-zinc-800/70">{stat.label}</p>
                  <p className="mt-1 font-display text-3xl leading-none tabular-nums text-zinc-800">{stat.value}</p>
                </div>
              ))}
            </div>

            <p className={EYEBROW}>Posts</p>
            {posts.length === 0 ? <p className="text-sm text-zinc-600">Nenhum post ainda.</p> : null}
            <div className="safari-clip overflow-hidden rounded-2xl border border-zinc-800/10 bg-cream">
              <div className="scroll-pill max-h-[30rem] space-y-0 overflow-auto">
                {posts.map((post) => (
                  <div key={post.id} className={`flex items-center gap-3 border-b border-zinc-800/10 p-3 last:border-b-0 ${post.isHidden ? 'opacity-60' : ''}`}>
                    <a href={post.fullUrl} target="_blank" rel="noopener noreferrer" className="safari-clip relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#f6edd7]">
                      <img src={post.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                      {post.mediaType === 'video' ? <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[0.6rem] text-white">vídeo</span> : null}
                      {/* Post com várias fotos/vídeos (carrossel). */}
                      {post.media && post.media.length > 1 ? (
                        <span className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[0.6rem] font-semibold text-white">1/{post.media.length}</span>
                      ) : null}
                    </a>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="truncate font-medium text-zinc-800">
                        {post.authorName}
                        {post.authorRole ? (
                          <span className="ml-2 rounded-full bg-[#ecd59f] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#4a3413]">
                            {post.authorRole === 'noivo' ? 'Noivo' : 'Noiva'}
                          </span>
                        ) : null}
                      </p>
                      {post.caption ? <p className="truncate text-xs text-zinc-600">{post.caption}</p> : null}
                      <p className="text-xs text-zinc-500">
                        {timeAgo(post.createdAt)} · {post.likes} {post.likes === 1 ? "curtida" : "curtidas"} · {post.comments} coment.{post.isHidden ? ' · oculto' : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingPost({ id: post.id, authorName: post.authorName, caption: post.caption ?? '', thumbUrl: post.thumbUrl, fullUrl: post.fullUrl, mediaType: post.mediaType, cardFocus: post.cardFocus })}
                        className={`${SMALL} border-zinc-800/20 text-zinc-800 hover:bg-zinc-800/5`}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => run(() => request('PATCH', { action: 'post', id: post.id, hidden: !post.isHidden }), post.isHidden ? 'Post visível de novo.' : 'Post ocultado.')}
                        className={`${SMALL} border-zinc-800/20 text-zinc-800 hover:bg-zinc-800/5`}
                      >
                        {post.isHidden ? 'Mostrar' : 'Ocultar'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmAction({
                            eyebrow: 'Confirmar exclusão',
                            title: 'Excluir post',
                            message: <>Excluir o post de <strong className="text-zinc-900">{post.authorName}</strong>? O arquivo é apagado do Cloudinary, junto com curtidas e comentários. Esta ação não pode ser desfeita.</>,
                            confirmLabel: 'Excluir',
                            tone: 'danger',
                            onConfirm: () => run(() => request('DELETE', { postId: post.id }), 'Post excluído.'),
                          })
                        }
                        className={`${SMALL} border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100`}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className={EYEBROW}>Comentários</p>
            {comments.length === 0 ? <p className="text-sm text-zinc-600">Nenhum comentário ainda.</p> : null}
            {comments.length > 0 ? (
              <div className="safari-clip overflow-hidden rounded-2xl border border-zinc-800/10 bg-cream">
                <div className="scroll-pill max-h-[24rem] overflow-auto">
                  {comments.map((comment) => (
                    <div key={comment.id} className={`flex items-start gap-3 border-b border-zinc-800/10 p-3 last:border-b-0 ${comment.isHidden ? 'opacity-60' : ''}`}>
                      {postById.get(comment.postId) ? (
                        <img src={postById.get(comment.postId)?.thumbUrl} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                      ) : null}
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="break-words text-zinc-800">
                          <span className="font-medium">{comment.authorName}</span>
                          {comment.authorRole ? (
                            <span className="mx-1.5 rounded-full bg-[#ecd59f] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#4a3413]">
                              {comment.authorRole === 'noivo' ? 'Noivo' : 'Noiva'}
                            </span>
                          ) : null}{' '}
                          {comment.text}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {timeAgo(comment.createdAt)}
                          {comment.isHidden ? ' · oculto' : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          onClick={() => run(() => request('PATCH', { action: 'comment', id: comment.id, hidden: !comment.isHidden }), comment.isHidden ? 'Comentário visível de novo.' : 'Comentário ocultado.')}
                          className={`${SMALL} border-zinc-800/20 text-zinc-800 hover:bg-zinc-800/5`}
                        >
                          {comment.isHidden ? 'Mostrar' : 'Ocultar'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({
                              eyebrow: 'Confirmar exclusão',
                              title: 'Excluir comentário',
                              message: <>Excluir o comentário de <strong className="text-zinc-900">{comment.authorName}</strong>?</>,
                              confirmLabel: 'Excluir',
                              tone: 'danger',
                              onConfirm: () => run(() => request('DELETE', { commentId: comment.id }), 'Comentário excluído.'),
                            })
                          }
                          className={`${SMALL} border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100`}
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <ConfirmDialog request={confirmAction} onClose={closeConfirm} />

      {editingPost ? (
        <EditPostDialog
          post={editingPost}
          adminName={admin?.name ?? 'Noivos'}
          onClose={() => setEditingPost(null)}
          onSave={async ({ authorName, caption, media }) => {
            await request('PATCH', { action: 'edit-post', id: editingPost.id, authorName, caption, media: media ?? undefined });
            setMessage(media ? 'Post atualizado com o novo arquivo.' : 'Post atualizado.');
            await load();
          }}
        />
      ) : null}

      {/* A mesma janela de postar do mural (câmera, galeria, legenda), já com o nome de quem está no painel. */}
      <AnimatePresence>
        {admin && composerViewerId ? (
          <Composer
            key="admin-composer"
            viewerId={composerViewerId}
            authorName={admin.name}
            viewerAdmin={admin}
            onAuthorName={() => undefined}
            onClose={() => setComposerViewerId(null)}
            onPosted={() => {
              setComposerViewerId(null);
              setMessage('Publicado no mural em destaque.');
              load();
            }}
          />
        ) : null}
      </AnimatePresence>
    </section>
  );
}
