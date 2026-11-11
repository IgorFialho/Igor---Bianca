"use client";

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
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

type Track = { id: string; title: string; artist: string | null; url: string; builtIn: boolean; duration: number | null; start: number };
type Page = { key: string; label: string; path: string };
type Settings = { mode: 'single' | 'per_page'; singleTrack: string; pageTracks: Record<string, string | null> };

const formatDuration = (seconds: number | null) => {
  if (!seconds) return '';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
};

/** Lê um tempo digitado ("1:23", "83" ou "1:23.5") em segundos; null quando não dá para entender. */
function parseTime(text: string) {
  const value = text.trim().replace(',', '.');
  if (!value) return 0;
  const match = value.match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const minutes = match[1] ? Number(match[1]) : 0;
  const seconds = Number(match[2]);
  if (match[1] && seconds >= 60) return null;
  return Math.round((minutes * 60 + seconds) * 10) / 10;
}

/** Tempo em m:ss (com décimo quando houver). */
const formatTime = (seconds: number) => {
  const whole = Math.floor(seconds);
  const tenth = Math.round((seconds - whole) * 10);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}${tenth ? `.${tenth}` : ''}`;
};

/** Player de cada música na lista (para ouvir a partir do início escolhido e pegar o ponto atual). */
const trackAudio = (id: string) => document.getElementById(`music-audio-${id}`) as HTMLAudioElement | null;

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
  const [renaming, setRenaming] = useState<{ id: string; title: string; artist: string; start: string } | null>(null);
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
    const start = parseTime(renaming.start);
    const duration = tracks.find((track) => track.id === renaming.id)?.duration ?? null;
    if (start === null) {
      setError('Tempo de início inválido. Use minutos:segundos, por exemplo 0:45 ou 1:30.');
      return;
    }
    if (duration && start >= duration - 1) {
      setError(`O início precisa ser antes do fim da música (${formatDuration(duration)}).`);
      return;
    }
    setError('');
    try {
      await request('PATCH', { action: 'edit', id: renaming.id, title: renaming.title, artist: renaming.artist, start });
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
                <p id="music-single-label" className="text-xs text-zinc-600">
                  Música de todas as páginas
                </p>
                <TrackSelect
                  labelId="music-single-label"
                  tracks={tracks}
                  value={draft.singleTrack}
                  onChange={(value) => setDraft({ ...draft, singleTrack: value ?? draft.singleTrack })}
                />
              </div>
            ) : (
              <div className="space-y-3">
                {pages.map((page) => (
                  <div key={page.key} className="space-y-1.5">
                    <p id={`music-${page.key}-label`} className="text-xs text-zinc-600">
                      {page.label} <span className="text-zinc-400">({page.path})</span>
                    </p>
                    <TrackSelect
                      labelId={`music-${page.key}-label`}
                      tracks={tracks}
                      allowNone
                      value={draft.pageTracks[page.key] ?? null}
                      onChange={(value) => setDraft({ ...draft, pageTracks: { ...draft.pageTracks, [page.key]: value } })}
                    />
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
                        <StartTimeField trackId={track.id} value={renaming.start} onChange={(start) => setRenaming({ ...renaming, start })} />
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
                        {track.start > 0 ? (
                          <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-champagne-600/10 px-2 py-0.5 text-[0.7rem] font-medium text-champagne-700">
                            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                              <path d="M8 5.5v13l10-6.5z" />
                            </svg>
                            Começa em {formatTime(track.start)}
                          </p>
                        ) : null}
                      </div>
                    )}
                    {renaming?.id !== track.id ? (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setRenaming({ id: track.id, title: track.title, artist: track.artist ?? '', start: track.start ? formatTime(track.start) : '0:00' })}
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
                  <audio id={`music-audio-${track.id}`} src={track.url} controls preload="none" className="h-9 w-full" />
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

/** Ícone de disco (música) ou de som desligado ("Sem música"). */
function TrackIcon({ none = false, active = false }: { none?: boolean; active?: boolean }) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
        none ? 'bg-zinc-800/5 text-zinc-500' : active ? 'bg-champagne-600 text-[#fff9f1]' : 'bg-champagne-600/15 text-champagne-700'
      }`}
      aria-hidden="true"
    >
      {none ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" strokeLinejoin="round" />
          <path d="m16 9.5 5 5m0-5-5 5" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
          <path d="M12 5.5a6.5 6.5 0 0 1 6.5 6.5" strokeLinecap="round" opacity="0.55" />
        </svg>
      )}
    </span>
  );
}

type TrackChoice = { id: string | null; title: string; artist: string | null; duration: number | null };

/** Seletor de música estilizado (no lugar do <select>): nome, autoria e duração; abre uma lista animada. */
function TrackSelect({
  labelId,
  tracks,
  value,
  allowNone = false,
  onChange,
}: {
  labelId: string;
  tracks: Track[];
  value: string | null;
  allowNone?: boolean;
  onChange: (value: string | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const choices: TrackChoice[] = [
    ...tracks.map((track) => ({ id: track.id, title: track.title, artist: track.artist, duration: track.duration })),
    ...(allowNone ? [{ id: null, title: 'Sem música', artist: 'O player some nesta página', duration: null }] : []),
  ];
  const selectedIndex = Math.max(0, choices.findIndex((choice) => choice.id === value));
  const selected = choices[selectedIndex];
  const describe = (choice: TrackChoice) =>
    `${choice.id ? choice.artist || 'Sem autoria informada' : choice.artist ?? ''}${choice.duration ? ` · ${formatDuration(choice.duration)}` : ''}`;

  // Fecha ao tocar fora.
  useEffect(() => {
    if (!isOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [isOpen]);

  // Ao abrir perto do fim da tela, rola a página até a lista aparecer inteira.
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => listRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 200);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  // Mantém a opção destacada visível ao navegar pelo teclado.
  useEffect(() => {
    if (!isOpen) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [highlight, isOpen]);

  const open = () => {
    setHighlight(selectedIndex);
    setIsOpen(true);
  };
  const choose = (index: number) => {
    const choice = choices[index];
    if (choice) onChange(choice.id);
    setIsOpen(false);
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (!isOpen) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        open();
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((index) => Math.min(choices.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(highlight);
    } else if (event.key === 'Tab') setIsOpen(false);
  };

  return (
    <div ref={boxRef} className={`relative ${isOpen ? 'z-30' : ''}`} onKeyDown={onKeyDown}>
      <button
        type="button"
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={labelId}
        className={`flex w-full items-center gap-3 rounded-2xl border bg-[#fffaf1] px-3 py-2.5 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-champagne-600/25 ${
          isOpen ? 'border-champagne-600 shadow-[0_10px_30px_rgba(47,36,27,0.10)] ring-2 ring-champagne-600/15' : 'border-zinc-800/15 hover:border-champagne-600/50'
        }`}
      >
        <TrackIcon none={!selected?.id} active={Boolean(selected?.id)} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-zinc-800">{selected?.title ?? 'Escolha uma música'}</span>
          {selected ? <span className="block truncate text-xs text-zinc-500">{describe(selected)}</span> : null}
        </span>
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <AnimatePresence>
        {isOpen ? (
          <motion.ul
            ref={listRef}
            role="listbox"
            aria-labelledby={labelId}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute inset-x-0 top-full z-30 mt-2 max-h-72 origin-top space-y-1 overflow-y-auto rounded-2xl border border-zinc-800/10 bg-[#fffaf1] p-1.5 shadow-[0_24px_50px_rgba(47,36,27,0.18)]"
          >
            {choices.map((choice, index) => {
              const isSelected = index === selectedIndex;
              return (
                <li
                  key={choice.id ?? NO_MUSIC}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  onPointerEnter={() => setHighlight(index)}
                  onClick={() => choose(index)}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors ${index === highlight ? 'bg-champagne-600/10' : ''} ${
                    !choice.id && index > 0 ? 'border-t border-zinc-800/10' : ''
                  }`}
                >
                  <TrackIcon none={!choice.id} active={isSelected && Boolean(choice.id)} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${isSelected ? 'font-semibold text-zinc-900' : 'font-medium text-zinc-800'}`}>{choice.title}</span>
                    <span className="block truncate text-xs text-zinc-500">{describe(choice)}</span>
                  </span>
                  {isSelected ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-champagne-700" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                      <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </li>
              );
            })}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** "Começar em": tempo digitado, pegar o ponto atual do player da música e ouvir a partir dali. */
function StartTimeField({ trackId, value, onChange }: { trackId: string; value: string; onChange: (value: string) => void }) {
  const parsed = parseTime(value);
  const nudge = (delta: number) => onChange(formatTime(Math.max(0, (parsed ?? 0) + delta)));
  const useCurrent = () => {
    const audio = trackAudio(trackId);
    if (audio) onChange(formatTime(Math.round(audio.currentTime * 10) / 10));
  };
  const listen = () => {
    const audio = trackAudio(trackId);
    if (!audio || parsed === null) return;
    const play = () => {
      audio.currentTime = parsed;
      void audio.play().catch(() => undefined);
    };
    if (audio.readyState >= 1) play();
    else {
      audio.preload = 'auto';
      audio.addEventListener('loadedmetadata', play, { once: true });
      audio.load();
    }
  };
  const small = 'rounded-full border border-zinc-800/15 bg-[#fffaf1] px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-800/5';
  return (
    <div className="space-y-2 rounded-xl border border-zinc-800/10 bg-[#fffaf1]/70 p-3">
      <label htmlFor={`music-start-${trackId}`} className="flex items-center gap-1.5 text-xs font-medium text-zinc-700">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-champagne-700" fill="currentColor" aria-hidden="true">
          <path d="M8 5.5v13l10-6.5z" />
        </svg>
        Começar em <span className="font-normal text-zinc-500">(minutos:segundos)</span>
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => nudge(-5)} className={small} aria-label="Voltar 5 segundos">
          −5s
        </button>
        <input
          id={`music-start-${trackId}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          placeholder="0:00"
          className={`w-20 rounded-full border bg-cream px-3 py-1.5 text-center text-sm tabular-nums text-zinc-800 focus:outline-none focus:ring-2 focus:ring-champagne-600/20 ${
            parsed === null ? 'border-rose-400' : 'border-zinc-800/15 focus:border-champagne-600'
          }`}
        />
        <button type="button" onClick={() => nudge(5)} className={small} aria-label="Avançar 5 segundos">
          +5s
        </button>
        <button type="button" onClick={useCurrent} className={small}>
          Usar ponto do player
        </button>
        <button type="button" onClick={listen} disabled={parsed === null} className={`${small} border-champagne-600/40 text-champagne-700 disabled:opacity-50`}>
          ▶ Ouvir daqui
        </button>
      </div>
      <p className="text-[0.7rem] text-zinc-500">
        No site, a música começa nesse ponto e, ao terminar, recomeça dele. Dica: toque a música no player abaixo, pause no momento certo e use
        &quot;Usar ponto do player&quot;.
      </p>
    </div>
  );
}
