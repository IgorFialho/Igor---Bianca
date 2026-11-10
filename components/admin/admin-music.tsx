"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog, type ConfirmRequest } from '@/components/admin/confirm-dialog';
import { uploadToCloudinary } from '@/components/mural/mural-client';

const CARD = 'rounded-[2rem] border border-zinc-800/10 bg-[#fffaf1] p-6 shadow-[0_24px_60px_rgba(47,36,27,0.08)] sm:p-8';
const EYEBROW = 'text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70';
const FIELD =
  'w-full rounded-xl border border-zinc-800/15 bg-cream px-4 py-2.5 text-sm text-zinc-800 focus:border-champagne-600 focus:outline-none focus:ring-2 focus:ring-champagne-600/20';
const BUTTON = 'inline-flex items-center justify-center rounded-full px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] transition-colors disabled:cursor-not-allowed disabled:opacity-60';
const PRIMARY = `${BUTTON} bg-champagne-600 text-[#fff9f1] hover:opacity-90`;
const SECONDARY = `${BUTTON} border border-zinc-800/20 text-zinc-800 hover:bg-zinc-800/5`;
const SMALL = 'rounded-full border px-3 py-1 text-xs font-medium transition-colors';

const MAX_MUSIC_BYTES = 40 * 1024 * 1024;
const NO_MUSIC = '__sem__';

type Track = { id: string; title: string; artist: string | null; url: string; builtIn: boolean; duration: number | null };
type Page = { key: string; label: string; path: string };
type Settings = { mode: 'single' | 'per_page'; singleTrack: string; pageTracks: Record<string, string | null> };

const formatDuration = (seconds: number | null) => {
  if (!seconds) return '';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
};

/** Duração do áudio escolhido (para mostrar na lista). */
function readAudioDuration(file: File) {
  return new Promise<number | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

// Aba "Músicas" do painel: biblioteca (enviar, ouvir, renomear, excluir) e o que toca em cada página.
export function AdminMusic() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [uploadsReady, setUploadsReady] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [upload, setUpload] = useState<{ file: File; title: string; artist: string; duration: number | null } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string; artist: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmRequest | null>(null);
  const closeConfirm = useCallback(() => setConfirmAction(null), []);
  const fileRef = useRef<HTMLInputElement>(null);

  const request = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: Record<string, unknown>) => {
    const response = await fetch('/api/admin/music', {
      method,
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 401) {
      window.location.href = '/admin/login';
      throw new Error('Sessão expirada.');
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || 'Não foi possível concluir.');
    return data;
  };

  const load = useCallback(async () => {
    try {
      const data = await request('GET');
      setTracks(data.tracks);
      setPages(data.pages);
      setSettings(data.settings);
      setDraft(data.settings);
      setUploadsReady(data.uploadsReady);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar as músicas.');
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 3500);
    return () => window.clearTimeout(timer);
  }, [message]);

  const pickFile = async (file: File | undefined) => {
    setError('');
    if (!file) return;
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|aac|wav|ogg)$/i.test(file.name)) {
      setError('Escolha um arquivo de música (MP3, M4A, WAV…).');
      return;
    }
    if (file.size > MAX_MUSIC_BYTES) {
      setError('Arquivo muito grande (máximo 40 MB).');
      return;
    }
    const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 80) || 'Música';
    setUpload({ file, title, artist: '', duration: await readAudioDuration(file) });
  };

  const sendUpload = async () => {
    if (!upload) return;
    // Autoria obrigatória: aparece no player, por cuidado com o direito de uso.
    if (upload.artist.trim().length < 2) {
      setError('Informe a autoria da música (artista/intérprete) antes de enviar.');
      document.getElementById('music-upload-artist')?.focus();
      return;
    }
    setError('');
    setProgress(0);
    try {
      const sign = await request('POST', { action: 'sign' });
      const result = await uploadToCloudinary(upload.file, upload.file.name || 'musica.mp3', sign, setProgress);
      await request('POST', {
        action: 'add',
        publicId: result.public_id,
        version: result.version,
        signature: result.signature,
        title: upload.title.trim() || 'Música',
        artist: upload.artist.trim(),
        duration: result.duration ?? upload.duration,
      });
      setUpload(null);
      setMessage('Música adicionada.');
      await load();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Não foi possível enviar.');
    } finally {
      setProgress(null);
    }
  };

  const saveSettings = async () => {
    if (!draft) return;
    setIsSaving(true);
    setError('');
    try {
      const data = await request('PATCH', { action: 'settings', ...draft });
      setSettings(data.settings);
      setDraft(data.settings);
      setMessage('Músicas das páginas salvas. Quem estiver no site vê a mudança ao trocar de página ou voltar à aba.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar.');
    } finally {
      setIsSaving(false);
    }
  };

  const saveRename = async () => {
    if (!renaming) return;
    try {
      await request('PATCH', { action: 'edit', id: renaming.id, title: renaming.title, artist: renaming.artist });
      setRenaming(null);
      setMessage('Música atualizada.');
      await load();
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : 'Não foi possível renomear.');
    }
  };

  const askDelete = (track: Track) => {
    const usedIn = settings
      ? settings.mode === 'single'
        ? settings.singleTrack === track.id
          ? ['todo o site']
          : []
        : pages.filter((page) => settings.pageTracks[page.key] === track.id).map((page) => page.label)
      : [];
    setConfirmAction({
      eyebrow: 'Confirmar exclusão',
      title: 'Excluir música',
      message: (
        <>
          Excluir <strong className="text-zinc-900">{track.title}</strong>?
          {usedIn.length ? <> Ela toca em: {usedIn.join(', ')}. Essas páginas passam a tocar a música original do site.</> : null} O arquivo é apagado e
          não dá para desfazer.
        </>
      ),
      confirmLabel: 'Excluir',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await request('DELETE', { id: track.id });
          setMessage('Música excluída.');
          await load();
        } catch (deleteError) {
          setError(deleteError instanceof Error ? deleteError.message : 'Não foi possível excluir.');
        }
      },
    });
  };

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const trackOptions = (allowNone: boolean) => (
    <>
      {tracks.map((track) => (
        <option key={track.id} value={track.id}>
          {track.title}
        </option>
      ))}
      {allowNone ? <option value={NO_MUSIC}>Sem música</option> : null}
    </>
  );

  return (
    <section className={CARD}>
      <div>
        <h2 className="font-display text-4xl leading-none text-zinc-800">Músicas do site</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Escolham uma música para o site todo ou uma para cada página. Na página principal, a música continua começando quando o convidado entra pela
          introdução.
        </p>
      </div>

      {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-olive-800">{message}</p> : null}
      {isLoading ? <p className="mt-6 text-sm text-zinc-600">Carregando…</p> : null}

      {draft ? (
        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
          {/* O que toca */}
          <div className="space-y-5 rounded-2xl border border-zinc-800/10 bg-cream p-5">
            <p className={EYEBROW}>O que toca</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  { key: 'single', title: 'Uma música para todo o site', text: 'Toca contínua, sem recomeçar ao trocar de página.' },
                  { key: 'per_page', title: 'Música por página', text: 'Cada página com a sua música ou sem música.' },
                ] as const
              ).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setDraft({ ...draft, mode: option.key })}
                  aria-pressed={draft.mode === option.key}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    draft.mode === option.key ? 'border-champagne-600 bg-[#fffaf1] ring-2 ring-champagne-600/20' : 'border-zinc-800/15 hover:bg-zinc-800/5'
                  }`}
                >
                  <span className="block text-sm font-semibold text-zinc-800">{option.title}</span>
                  <span className="mt-1 block text-xs text-zinc-600">{option.text}</span>
                </button>
              ))}
            </div>

            {draft.mode === 'single' ? (
              <div className="space-y-1.5">
                <label htmlFor="music-single" className="text-xs text-zinc-600">
                  Música de todas as páginas
                </label>
                <select id="music-single" value={draft.singleTrack} onChange={(event) => setDraft({ ...draft, singleTrack: event.target.value })} className={FIELD}>
                  {trackOptions(false)}
                </select>
              </div>
            ) : (
              <div className="space-y-3">
                {pages.map((page) => (
                  <div key={page.key} className="space-y-1.5">
                    <label htmlFor={`music-${page.key}`} className="text-xs text-zinc-600">
                      {page.label} <span className="text-zinc-400">({page.path})</span>
                    </label>
                    <select
                      id={`music-${page.key}`}
                      value={draft.pageTracks[page.key] ?? NO_MUSIC}
                      onChange={(event) =>
                        setDraft({ ...draft, pageTracks: { ...draft.pageTracks, [page.key]: event.target.value === NO_MUSIC ? null : event.target.value } })
                      }
                      className={FIELD}
                    >
                      {trackOptions(true)}
                    </select>
                  </div>
                ))}
                <p className="text-xs text-zinc-600">
                  Páginas com a mesma música continuam tocando de onde estavam; numa página &quot;Sem música&quot; o player some e a música volta ao sair dela.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={saveSettings} disabled={!isDirty || isSaving} className={PRIMARY}>
                {isSaving ? 'Salvando…' : 'Salvar'}
              </button>
              {isDirty ? (
                <button type="button" onClick={() => setDraft(settings)} disabled={isSaving} className={SECONDARY}>
                  Desfazer
                </button>
              ) : null}
            </div>
          </div>

          {/* Biblioteca */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className={EYEBROW}>Biblioteca</p>
              {uploadsReady ? (
                <button type="button" onClick={() => fileRef.current?.click()} disabled={progress !== null} className={SECONDARY}>
                  Adicionar música
                </button>
              ) : (
                <p className="text-xs text-zinc-500">Envio de arquivos não configurado.</p>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg"
                className="hidden"
                onChange={(event) => {
                  void pickFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </div>

            {upload ? (
              <div className="space-y-3 rounded-2xl border border-champagne-600/30 bg-[#fdf5e3] p-4">
                <p className="text-xs text-zinc-600">
                  Nova música: {upload.file.name}
                  {upload.duration ? ` · ${formatDuration(upload.duration)}` : ''}
                </p>
                <label htmlFor="music-upload-title" className="text-xs text-zinc-600">
                  Nome que aparece no painel
                </label>
                <input
                  id="music-upload-title"
                  value={upload.title}
                  onChange={(event) => setUpload({ ...upload, title: event.target.value })}
                  maxLength={80}
                  disabled={progress !== null}
                  className={FIELD}
                />
                <label htmlFor="music-upload-artist" className="text-xs text-zinc-600">
                  Autoria <span className="text-rose-700">*</span> <span className="text-zinc-400">(artista/intérprete; se quiser, compositor e licença)</span>
                </label>
                <input
                  id="music-upload-artist"
                  value={upload.artist}
                  onChange={(event) => setUpload({ ...upload, artist: event.target.value })}
                  maxLength={120}
                  disabled={progress !== null}
                  placeholder="Ex.: Ed Sheeran · composição de Ed Sheeran"
                  className={FIELD}
                />
                <p className="text-xs text-zinc-500">A autoria aparece no player do site. Usem músicas que vocês tenham direito de tocar.</p>
                {progress !== null ? (
                  <div aria-live="polite">
                    <div className="flex justify-between text-xs text-zinc-600">
                      <span>Enviando…</span>
                      <span>{Math.round(progress * 100)}%</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-800/10">
                      <div className="h-full rounded-full bg-champagne-600 transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
                    </div>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <button type="button" onClick={sendUpload} disabled={progress !== null} className={PRIMARY}>
                    Enviar
                  </button>
                  <button type="button" onClick={() => setUpload(null)} disabled={progress !== null} className={SECONDARY}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}

            <div className="safari-clip overflow-hidden rounded-2xl border border-zinc-800/10 bg-cream">
              {tracks.map((track) => (
                <div key={track.id} className="space-y-2 border-b border-zinc-800/10 p-4 last:border-b-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {renaming?.id === track.id ? (
                      <div className="grid min-w-0 flex-1 gap-2">
                        <input
                          value={renaming.title}
                          onChange={(event) => setRenaming({ ...renaming, title: event.target.value })}
                          maxLength={80}
                          aria-label="Nome da música"
                          placeholder="Nome da música"
                          className={FIELD}
                        />
                        <input
                          value={renaming.artist}
                          onChange={(event) => setRenaming({ ...renaming, artist: event.target.value })}
                          maxLength={120}
                          aria-label="Autoria"
                          placeholder="Autoria (artista/intérprete; compositor, licença)"
                          className={FIELD}
                        />
                        <div className="flex gap-1.5">
                          <button type="button" onClick={saveRename} className={`${SMALL} border-champagne-600 bg-champagne-600 text-[#fff9f1]`}>
                            Salvar
                          </button>
                          <button type="button" onClick={() => setRenaming(null)} className={`${SMALL} border-zinc-800/20 text-zinc-800`}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-800">
                          {track.title}
                          {track.duration ? <span className="ml-2 text-xs font-normal text-zinc-500">{formatDuration(track.duration)}</span> : null}
                          {track.builtIn ? <span className="ml-2 text-xs font-normal text-zinc-500">(já vem com o site)</span> : null}
                        </p>
                        {track.artist ? (
                          <p className="truncate text-xs text-zinc-600">{track.artist}</p>
                        ) : (
                          <p className="text-xs font-medium text-rose-700">Sem autoria informada: clique em Editar para incluir</p>
                        )}
                      </div>
                    )}
                    {renaming?.id !== track.id ? (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setRenaming({ id: track.id, title: track.title, artist: track.artist ?? '' })}
                          className={`${SMALL} border-zinc-800/20 text-zinc-800 hover:bg-zinc-800/5`}
                        >
                          Editar
                        </button>
                        {!track.builtIn ? (
                          <button type="button" onClick={() => askDelete(track)} className={`${SMALL} border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100`}>
                            Excluir
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <audio src={track.url} controls preload="none" className="h-9 w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog request={confirmAction} onClose={closeConfirm} />
    </section>
  );
}
