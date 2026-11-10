"use client";

import { AnimatePresence, motion } from 'framer-motion';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Portal } from '@/components/home/portal';
import { Reveal } from '@/components/home/reveal';
import { SiteHeader } from '@/components/home/site-header';
import { CameraCapture, isCameraSupported } from '@/components/mural/camera-capture';
import { INTRO_HOME_HREF } from '@/components/intro-arco';
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  compressImage,
  initials,
  getViewerId,
  readAuthorName,
  readStoredCode,
  readVideoMeta,
  storeAuthorName,
  timeAgo,
  uploadToCloudinary,
  type MuralCommentView,
  type MuralPostView,
  type MuralSettingsView,
} from '@/components/mural/mural-client';

const NAV_LINKS = [
  { label: 'Início', href: INTRO_HOME_HREF },
  { label: 'Nossa história', href: '/login#nossa-historia' },
  { label: 'Cerimônia', href: '/login#cerimonia' },
  { label: 'Confirmar presença', href: '/login#rsvp' },
  { label: 'Lista de presentes', href: '/presentes' },
  { label: 'Perguntas', href: '/login#perguntas' },
];

const EYEBROW = 'text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70';
const PRIMARY =
  'inline-flex items-center justify-center rounded-full bg-champagne-600 px-8 py-3.5 text-xs font-medium uppercase tracking-[0.2em] text-[#fff9f1] transition-transform duration-500 ease-[cubic-bezier(0.22,0.72,0.36,1)] hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100';
const SECONDARY =
  'inline-flex items-center justify-center rounded-full border border-zinc-800/20 px-6 py-3 text-xs font-medium uppercase tracking-[0.16em] text-zinc-800 transition-colors hover:bg-zinc-800/5 disabled:opacity-60';
const FIELD =
  'w-full rounded-2xl border border-zinc-800/15 bg-cream px-5 py-3 text-sm text-zinc-800 placeholder:text-zinc-500 focus:border-champagne-600 focus:outline-none focus:ring-2 focus:ring-champagne-600/20';
const REFRESH_MS = 20_000;

// Cores do buquê (as mesmas do site): rosas em rosé, folhas oliva, papel champagne e laço caramelo.
const ROSE = '#c97a8a';
const ROSE_DARK = '#9e4f63';
const LEAF = '#7d8a5a';
const PAPER = '#e9d3b4';
const RIBBON = '#8a5a2b';

/**
 * Buquê de rosas usado como "curtida" do mural. Sem curtir: só o contorno (cor do texto).
 * Curtido: colorido. `tone="light"` deixa o contorno branco (sobre fotos).
 */
function BouquetIcon({ filled, className = '', tone = 'dark' }: { filled: boolean; className?: string; tone?: 'dark' | 'light' }) {
  const line = tone === 'light' ? '#ffffff' : 'currentColor';
  const outline = filled ? ROSE_DARK : line;
  const petals = filled ? '#f6dde2' : line;
  // Rosa vista de frente: botão redondo + pétalas em "taça" (duas curvas) dentro.
  const roses = [
    { cx: 10.4, cy: 12.4, r: 4.1 },
    { cx: 21.6, cy: 12.4, r: 4.1 },
    { cx: 16, cy: 9.2, r: 4.8 },
  ];
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* folhas */}
      <path d="M6.6 16.8C3.9 16.6 2.2 14.6 2 12.2c2.6-.3 4.8 1.1 5.9 3.3" fill={filled ? LEAF : 'none'} stroke={filled ? LEAF : line} strokeWidth="1.3" />
      <path d="M25.4 16.8c2.7-.2 4.4-2.2 4.6-4.6-2.6-.3-4.8 1.1-5.9 3.3" fill={filled ? LEAF : 'none'} stroke={filled ? LEAF : line} strokeWidth="1.3" />
      {/* papel do buquê (cone) com uma dobra */}
      <path d="M7.4 15.6h17.2l-6.9 13.5a1.9 1.9 0 0 1-3.4 0L7.4 15.6Z" fill={filled ? PAPER : 'none'} stroke={filled ? '#c9a77c' : line} strokeWidth="1.3" />
      <path d="M12.6 15.6 16 29.6" stroke={filled ? '#d4b48c' : line} strokeWidth="1" opacity={filled ? 1 : 0.6} />
      {/* fita */}
      <path d="M10.9 20.4h10.2l-1 2.1h-8.2l-1-2.1Z" fill={filled ? RIBBON : 'none'} stroke={filled ? RIBBON : line} strokeWidth="1.1" />
      {/* rosas */}
      {roses.map((rose, index) => (
        <g key={index}>
          {/* Em contorno, a rosa da frente tampa as linhas das de trás (fundo da janela); sobre fotos, fica vazada. */}
          <circle cx={rose.cx} cy={rose.cy} r={rose.r} fill={filled ? ROSE : tone === 'light' ? 'none' : '#fffaf1'} stroke={outline} strokeWidth="1.3" />
          <path
            d={`M${rose.cx - rose.r * 0.62} ${rose.cy - rose.r * 0.05}q${rose.r * 0.62} ${rose.r * 0.95} ${rose.r * 1.24} 0`}
            stroke={petals}
            strokeWidth="1.1"
          />
          <path
            d={`M${rose.cx - rose.r * 0.3} ${rose.cy - rose.r * 0.3}q${rose.r * 0.3} ${rose.r * 0.5} ${rose.r * 0.6} 0`}
            stroke={petals}
            strokeWidth="1"
          />
        </g>
      ))}
    </svg>
  );
}

function CommentIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20 11.5c0 4.1-3.6 7.5-8 7.5-1.3 0-2.5-.3-3.6-.8L4 19.5l1.2-3.6A7.2 7.2 0 0 1 4 11.5C4 7.4 7.6 4 12 4s8 3.4 8 7.5Z" strokeLinejoin="round" />
    </svg>
  );
}

function Avatar({ name, size = 'h-9 w-9' }: { name: string; size?: string }) {
  return (
    <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-champagne-600/15 text-xs font-semibold text-champagne-700`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** Trava a rolagem da página enquanto uma janela está aberta. */
function useLockScroll(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}

export function MuralFeed() {
  // Mural aberto: o aparelho tem um identificador próprio e quem publica informa o nome (lembrado aqui).
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [authorName, setAuthorName] = useState('');
  const [settings, setSettings] = useState<MuralSettingsView | null>(null);
  const [posts, setPosts] = useState<MuralPostView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [viewerPostId, setViewerPostId] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);

  useEffect(() => {
    setViewerId(getViewerId());
    setAuthorName(readAuthorName());
  }, []);

  const updateAuthorName = useCallback((name: string) => {
    setAuthorName(name);
    storeAuthorName(name);
  }, []);

  const loadFeed = useCallback(
    async (silent = false) => {
      if (!viewerId) return;
      if (!silent) setIsLoading(true);
      try {
        const inviteCode = readStoredCode();
        const query = new URLSearchParams({ viewerId });
        if (inviteCode) query.set('code', inviteCode);
        const response = await fetch(`/api/mural?${query.toString()}`, { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || 'Erro ao carregar o mural.');
        setSettings(data.settings);
        setPosts(data.posts);
        // Quem entrou com o código do convite já vem com o nome sugerido.
        if (data.suggestedName && !readAuthorName()) setAuthorName(data.suggestedName);
        setLoadError('');
      } catch (error) {
        if (!silent) setLoadError(error instanceof Error ? error.message : 'Erro ao carregar o mural.');
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [viewerId]
  );

  useEffect(() => {
    if (!viewerId) return;
    loadFeed();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadFeed(true);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [viewerId, loadFeed]);

  const commentsPost = posts.find((post) => post.id === commentsPostId) ?? null;
  const viewerIndex = posts.findIndex((post) => post.id === viewerPostId);
  const viewerPost = viewerIndex >= 0 ? posts[viewerIndex] : null;
  const updatePost = (id: string, patch: Partial<MuralPostView>) =>
    setPosts((current) => current.map((post) => (post.id === id ? { ...post, ...patch } : post)));
  const canInteract = Boolean(settings?.isOpen);

  if (viewerId === null) return <main className="min-h-screen bg-cream" />;

  return (
    <main className="relative min-h-screen bg-cream px-4 pb-32 pt-8 text-zinc-800 sm:px-6 md:px-10">
      <SiteHeader ctaLabel="Confirmar presença" ctaHref="/login#rsvp" links={NAV_LINKS} alwaysDark />

      <header className="mx-auto mt-16 max-w-3xl text-center md:mt-20">
        <Reveal>
          <p className={EYEBROW}>Mural do casamento</p>
          <h1 className="mt-4 font-display text-[3rem] leading-[0.92] md:text-[4.5rem]">Momentos de vocês com a gente</h1>
        </Reveal>
        <Reveal delay={0.14}>
          <p className="mx-auto mt-6 max-w-2xl text-base text-zinc-600 md:text-lg">
            Compartilhe as fotos e os vídeos que você registrar no nosso grande dia. Eles aparecem aqui na hora para todos os convidados.
          </p>
        </Reveal>
      </header>

      <section aria-label="Posts do mural" className="mx-auto mt-12 w-full max-w-5xl">
        {settings ? <MuralStatus settings={settings} authorName={authorName} /> : null}

        {isLoading ? <p className="mt-10 text-center text-zinc-600">Carregando o mural…</p> : null}
        {loadError ? (
          <div className="mt-10 text-center">
            <p className="text-rose-700">{loadError}</p>
            <button type="button" onClick={() => loadFeed()} className={`${SECONDARY} mt-4`}>
              Tentar novamente
            </button>
          </div>
        ) : null}

        {!isLoading && !loadError && posts.length === 0 ? (
          <p className="mt-12 text-center text-zinc-600">
            {settings?.isOpen ? 'Ainda não há posts. Que tal ser o primeiro?' : 'Os posts aparecem aqui quando o mural abrir.'}
          </p>
        ) : null}

        {posts.length > 0 ? (
          <div className="mx-auto mt-8 flex w-full max-w-[470px] flex-col gap-2 sm:gap-8">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                viewerId={viewerId}
                canInteract={canInteract}
                onChange={(patch) => updatePost(post.id, patch)}
                onOpenComments={() => setCommentsPostId(post.id)}
                onOpen={() => setViewerPostId(post.id)}
                onDeleted={() => setPosts((current) => current.filter((item) => item.id !== post.id))}
              />
            ))}
          </div>
        ) : null}
      </section>

      {settings?.isOpen && settings.uploadsReady ? (
        <button
          type="button"
          onClick={() => setIsComposerOpen(true)}
          className="fixed bottom-6 left-1/2 z-40 inline-flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-champagne-600 px-7 py-4 text-xs font-medium uppercase tracking-[0.2em] text-[#fff9f1] shadow-[0_18px_40px_rgba(47,36,27,0.3)] transition-transform hover:scale-[1.03] sm:bottom-8"
          style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          <span className="sm:hidden">Postar</span>
          <span className="hidden sm:inline">Postar foto ou vídeo</span>
        </button>
      ) : null}

      <AnimatePresence>
        {viewerPost ? (
          <PostModal
            key="post-modal"
            post={viewerPost}
            viewerId={viewerId}
            authorName={authorName}
            onAuthorName={updateAuthorName}
            canInteract={canInteract}
            hasPrevious={viewerIndex > 0}
            hasNext={viewerIndex < posts.length - 1}
            onPrevious={() => setViewerPostId(posts[viewerIndex - 1]?.id ?? null)}
            onNext={() => setViewerPostId(posts[viewerIndex + 1]?.id ?? null)}
            onClose={() => setViewerPostId(null)}
            onChange={(patch) => updatePost(viewerPost.id, patch)}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {commentsPost ? (
          <CommentsSheet
            key="comments"
            post={commentsPost}
            viewerId={viewerId}
            authorName={authorName}
            onAuthorName={updateAuthorName}
            canInteract={canInteract}
            onClose={() => setCommentsPostId(null)}
            onCountChange={(count) => updatePost(commentsPost.id, { comments: count })}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isComposerOpen ? (
          <Composer
            key="composer"
            viewerId={viewerId}
            authorName={authorName}
            onAuthorName={updateAuthorName}
            onClose={() => setIsComposerOpen(false)}
            onPosted={() => {
              setIsComposerOpen(false);
              loadFeed(true);
            }}
          />
        ) : null}
      </AnimatePresence>
    </main>
  );
}

function MuralStatus({ settings, authorName }: { settings: MuralSettingsView; authorName: string }) {
  const format = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }) : null;
  const opensAtLabel = format(settings.opensAt);
  const closesAtLabel = format(settings.closesAt);
  const pill = 'rounded-full bg-[#f6edd7] px-5 py-2 text-sm text-zinc-700';
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {authorName ? <p className="text-sm text-zinc-600">Olá, {authorName}!</p> : null}
      {settings.isOpen ? (
        <>
          {!settings.uploadsReady ? <p className={pill}>O envio de fotos está sendo preparado.</p> : null}
          {closesAtLabel ? <p className={pill}>O mural recebe postagens até {closesAtLabel}.</p> : null}
        </>
      ) : settings.isClosedBySchedule ? (
        <p className={pill}>O mural foi encerrado em {closesAtLabel}. Obrigado por compartilhar esses momentos!</p>
      ) : (
        <p className={pill}>
          {opensAtLabel ? `O mural abre para postagens em ${opensAtLabel}.` : 'O mural abre para postagens no dia do casamento.'}
        </p>
      )}
    </div>
  );
}

/** Segundos que faltam de um prazo vindo do servidor (conta a partir de agora, sem depender do relógio do celular). */
function useCountdown(secondsLeft: number) {
  const [deadline, setDeadline] = useState(() => Date.now() + secondsLeft * 1000);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setDeadline(Date.now() + secondsLeft * 1000);
    setNow(Date.now());
  }, [secondsLeft]);
  useEffect(() => {
    if (deadline <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

const formatCountdown = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** "apagar (4:12)" no próprio comentário, só enquanto durar o prazo de 5 minutos. */
function DeleteCommentLink({ secondsLeft, onClick }: { secondsLeft: number; onClick: (remaining: number) => void }) {
  const remaining = useCountdown(secondsLeft);
  if (remaining <= 0) return null;
  return (
    <button type="button" onClick={() => onClick(remaining)} className="ml-3 underline underline-offset-2 hover:text-rose-700">
      apagar ({formatCountdown(remaining)})
    </button>
  );
}

type ConfirmRequestView = {
  title: string;
  message: string;
  confirmLabel: string;
  /** "danger" (apagar, vermelho) ou "primary" (publicar, marrom). */
  tone?: 'danger' | 'primary';
  /** true = deu certo; texto = erro a mostrar (ex.: o prazo para apagar terminou). */
  onConfirm: () => Promise<boolean | string>;
};

/** Janela de confirmação do mural (publicar ou apagar comentário), por cima de tudo. */
function ConfirmPopup({ request, onClose }: { request: ConfirmRequestView | null; onClose: () => void }) {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setIsRunning(false);
    setError('');
    if (!request) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [request, onClose]);

  const confirm = async () => {
    if (!request) return;
    setIsRunning(true);
    setError('');
    const result = await request.onConfirm().catch(() => false);
    setIsRunning(false);
    if (result === true) onClose();
    else if (typeof result === 'string') setError(result);
    else setError(request.tone === 'primary' ? 'Não foi possível continuar. Tente de novo.' : 'Não foi possível apagar. Tente de novo.');
  };

  return (
    <Portal>
      <AnimatePresence>
        {request ? (
          <motion.div
            key="confirm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[240] flex items-center justify-center bg-zinc-950/55 px-5 backdrop-blur-sm"
            onClick={() => (isRunning ? undefined : onClose())}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="mural-confirm-title"
          >
            <motion.div
              initial={{ scale: 0.94, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-sm rounded-[1.75rem] bg-[#fffaf1] p-6 text-center shadow-2xl"
            >
              <h3 id="mural-confirm-title" className="font-display text-3xl italic leading-none text-zinc-800">
                {request.title}
              </h3>
              <p className="mt-3 text-sm text-zinc-600">{request.message}</p>
              {error ? <p className="mt-3 text-xs text-rose-700">{error}</p> : null}
              <div className="mt-6 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isRunning}
                  className="rounded-full border border-zinc-800/20 px-4 py-3 text-xs font-medium uppercase tracking-[0.14em] text-zinc-800 transition-colors hover:bg-zinc-800/5 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={isRunning}
                  autoFocus
                  className={`rounded-full px-4 py-3 text-xs font-medium uppercase tracking-[0.14em] transition-colors disabled:opacity-60 ${
                    request.tone === 'primary'
                      ? 'bg-champagne-600 text-[#fff9f1] hover:opacity-90'
                      : 'border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100'
                  }`}
                >
                  {isRunning ? (request.tone === 'primary' ? 'Aguarde…' : 'Apagando…') : request.confirmLabel}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Portal>
  );
}

/** Campo "Seu nome" (para comentar/publicar sem código); o nome fica lembrado neste aparelho. */
function NameField({ value, onChange, id, className = '' }: { value: string; onChange: (value: string) => void; id: string; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="sr-only">
        Seu nome
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={60}
        autoComplete="name"
        placeholder="Seu nome"
        className="w-full rounded-full border border-zinc-800/15 bg-cream px-4 py-2.5 text-sm focus:border-champagne-600 focus:outline-none focus:ring-2 focus:ring-champagne-600/20"
      />
    </div>
  );
}

type PostCardProps = {
  post: MuralPostView;
  viewerId: string;
  canInteract: boolean;
  onChange: (patch: Partial<MuralPostView>) => void;
  onOpenComments: () => void;
  /** Abre o post grande (um toque na foto/vídeo). */
  onOpen: () => void;
  onDeleted: () => void;
};

/** Formato da mídia no card, como o Instagram: entre retrato 4:5 e paisagem 1,91:1. */
function mediaAspect(post: MuralPostView) {
  if (!post.width || !post.height) return 4 / 5;
  return Math.min(1.91, Math.max(0.8, post.width / post.height));
}

/** Um post da linha do tempo: cabeçalho, foto/vídeo, curtir (buquê), comentários e legenda. */
function PostCard({ post, viewerId, canInteract, onChange, onOpenComments, onOpen, onDeleted }: PostCardProps) {
  // Quem publicou pode apagar só nos primeiros 2 minutos (o servidor confirma o prazo).
  const deleteRemaining = useCountdown(post.isMine ? post.deleteSecondsLeft : 0);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequestView | null>(null);
  const closeConfirm = useCallback(() => setConfirmRequest(null), []);
  const [likePop, setLikePop] = useState(0);
  const [burst, setBurst] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const lastTap = useRef(0);
  const singleTapTimer = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLElement>(null);

  // Vídeo toca sozinho (sem som) só enquanto está na tela, como no Instagram.
  useEffect(() => {
    if (post.mediaType !== 'video' || !videoRef.current || !cardRef.current) return;
    const video = videoRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          video.play().then(() => setIsPaused(false)).catch(() => setIsPaused(true));
        } else {
          video.pause();
        }
      },
      { threshold: [0, 0.6, 1] }
    );
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [post.mediaType]);

  const toggleLike = async () => {
    if (!canInteract) return;
    const nextLiked = !post.likedByMe;
    if (nextLiked) setLikePop((count) => count + 1);
    onChange({ likedByMe: nextLiked, likes: post.likes + (nextLiked ? 1 : -1) });
    try {
      const response = await fetch('/api/mural/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewerId, postId: post.id, like: nextLiked }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error);
      onChange({ likedByMe: data.liked, likes: data.likes });
    } catch {
      onChange({ likedByMe: post.likedByMe, likes: post.likes });
    }
  };

  // Um toque abre o post grande; toque duplo curte (buquê grande). Espera ~0,3 s para saber se vem o 2º toque.
  const handleMediaTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 320) {
      lastTap.current = 0;
      if (singleTapTimer.current) window.clearTimeout(singleTapTimer.current);
      if (!canInteract) {
        // Mural fechado (sem curtidas): o toque duplo só abre o post.
        videoRef.current?.pause();
        onOpen();
        return;
      }
      setBurst((count) => count + 1);
      if (!post.likedByMe) toggleLike();
      else setLikePop((count) => count + 1);
      return;
    }
    lastTap.current = now;
    singleTapTimer.current = window.setTimeout(() => {
      lastTap.current = 0;
      videoRef.current?.pause();
      onOpen();
    }, 330);
  };

  const deletePost = async () => {
    const response = await fetch('/api/mural/posts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewerId, postId: post.id }),
    });
    const data = await response.json().catch(() => null);
    if (response.ok) onDeleted();
    return response.ok ? true : data?.error || false;
  };

  const askDeletePost = () =>
    setConfirmRequest({
      title: post.mediaType === 'video' ? 'Apagar vídeo?' : 'Apagar foto?',
      message: `O post sai do mural junto com as curtidas e os comentários. Você ainda tem ${formatCountdown(deleteRemaining)} para apagar; depois, só os noivos.`,
      confirmLabel: 'Apagar',
      onConfirm: deletePost,
    });

  const caption = post.caption ?? '';
  const longCaption = caption.length > 120;

  return (
    <article ref={cardRef} className="-mx-4 overflow-hidden border-b sm:mx-0 border-zinc-800/10 pb-6 sm:rounded-[1.5rem] sm:border sm:bg-[#fffaf1] sm:pb-4 sm:shadow-[0_18px_40px_rgba(47,36,27,0.06)] safari-clip">
      <header className="flex items-center gap-3 px-4 py-3">
        <Avatar name={post.authorName} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-800">{post.authorName}</p>
          <p className="text-xs text-zinc-500">{timeAgo(post.createdAt)}</p>
        </div>
        {post.isMine && deleteRemaining > 0 ? (
          <button
            type="button"
            onClick={askDeletePost}
            aria-label={`Apagar meu post (ainda ${formatCountdown(deleteRemaining)})`}
            className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800/5"
          >
            <span className="tabular-nums">{formatCountdown(deleteRemaining)}</span>
            <span className="text-lg leading-none">⋯</span>
          </button>
        ) : null}
      </header>
      <ConfirmPopup request={confirmRequest} onClose={closeConfirm} />

      <div
        className="safari-clip relative w-full cursor-pointer select-none overflow-hidden bg-[#f1e7d3] sm:rounded-none"
        style={{ aspectRatio: String(mediaAspect(post)) }}
        onClick={handleMediaTap}
      >
        {post.mediaType === 'video' ? (
          <>
            <video
              ref={videoRef}
              src={post.fullUrl}
              poster={post.posterUrl ?? undefined}
              muted={isMuted}
              loop
              playsInline
              preload="metadata"
              className="absolute inset-0 h-full w-full object-cover"
            />
            {isPaused ? (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm">
                  <svg viewBox="0 0 24 24" className="h-7 w-7 translate-x-[2px]" fill="currentColor" aria-hidden="true">
                    <path d="M7 4.5v15l12-7.5-12-7.5Z" />
                  </svg>
                </span>
              </span>
            ) : null}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setIsMuted((muted) => !muted);
              }}
              aria-label={isMuted ? 'Ativar som' : 'Desativar som'}
              className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 5 6 9H3v6h3l5 4V5Z" fill="currentColor" />
                {isMuted ? <path d="m16 9 5 6m0-6-5 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />}
              </svg>
            </button>
          </>
        ) : (
          <img src={post.fullUrl} alt={caption || `Foto de ${post.authorName}`} loading="lazy" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
        )}

        {/* Buquê grande do toque duplo. */}
        <AnimatePresence>
          {burst > 0 ? (
            <motion.div
              key={burst}
              initial={{ scale: 0, opacity: 0, rotate: -12 }}
              animate={{ scale: [0, 1.25, 0.95, 1.05, 1], opacity: [0, 1, 1, 1, 0], rotate: [-12, 6, -3, 0, 0] }}
              transition={{ duration: 1, times: [0, 0.25, 0.45, 0.6, 1], ease: 'easeOut' }}
              onAnimationComplete={() => setBurst(0)}
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <BouquetIcon filled className="h-32 w-32 drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)] sm:h-36 sm:w-36" />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="px-4 pt-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleLike}
            disabled={!canInteract}
            aria-pressed={post.likedByMe}
            aria-label={post.likedByMe ? 'Descurtir' : 'Curtir'}
            className={`disabled:opacity-50 ${post.likedByMe ? '' : 'text-zinc-800 hover:text-[#9e4f63]'}`}
          >
            <motion.span
              key={likePop}
              className="block"
              initial={false}
              animate={likePop > 0 ? { scale: [1, 0.7, 1.3, 0.92, 1] } : { scale: 1 }}
              transition={{ duration: 0.45, times: [0, 0.15, 0.45, 0.7, 1], ease: 'easeOut' }}
            >
              <BouquetIcon filled={post.likedByMe} className="h-9 w-9" />
            </motion.span>
          </button>
          <button type="button" onClick={onOpenComments} aria-label="Comentar" className="text-zinc-800 hover:text-champagne-700">
            <CommentIcon className="h-7 w-7" />
          </button>
        </div>

        <p className="mt-2 text-sm font-semibold text-zinc-800">
          {post.likes} {post.likes === 1 ? 'curtida' : 'curtidas'}
        </p>

        {caption ? (
          <p className="mt-1 whitespace-pre-line break-words text-sm text-zinc-800">
            <span className="font-semibold">{post.authorName}</span>{' '}
            {longCaption && !expanded ? (
              <>
                {Array.from(caption).slice(0, 110).join('')}…{' '}
                <button type="button" onClick={() => setExpanded(true)} className="text-zinc-500">
                  mais
                </button>
              </>
            ) : (
              caption
            )}
          </p>
        ) : null}

        {post.comments > 0 ? (
          <button type="button" onClick={onOpenComments} className="mt-1 text-sm text-zinc-500 hover:text-zinc-700">
            {post.comments === 1 ? 'Ver 1 comentário' : `Ver todos os ${post.comments} comentários`}
          </button>
        ) : canInteract ? (
          <button type="button" onClick={onOpenComments} className="mt-1 text-sm text-zinc-500 hover:text-zinc-700">
            Adicione um comentário…
          </button>
        ) : null}
      </div>
    </article>
  );
}

type PostModalProps = {
  post: MuralPostView;
  viewerId: string;
  authorName: string;
  onAuthorName: (name: string) => void;
  canInteract: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
  onChange: (patch: Partial<MuralPostView>) => void;
};

/** Post aberto grande, como no Instagram: mídia à esquerda (em cima no celular) e comentários ao lado. */
function PostModal({ post, viewerId, authorName, onAuthorName, canInteract, hasPrevious, hasNext, onPrevious, onNext, onClose, onChange }: PostModalProps) {
  const [comments, setComments] = useState<MuralCommentView[] | null>(null);
  const [text, setText] = useState('');
  // Sem nome lembrado: pede o nome junto do comentário (só na primeira vez).
  const [nameDraft, setNameDraft] = useState(authorName);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [likePop, setLikePop] = useState(0);
  const [burst, setBurst] = useState(0);
  const lastTap = useRef(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const listEnd = useRef<HTMLDivElement>(null);
  useLockScroll(true);

  useEffect(() => {
    let cancelled = false;
    setComments(null);
    setError('');
    fetch(`/api/mural/comments?postId=${post.id}&viewerId=${encodeURIComponent(viewerId)}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setComments(Array.isArray(data?.comments) ? data.comments : []);
      })
      .catch(() => !cancelled && setComments([]));
    return () => {
      cancelled = true;
    };
  }, [post.id, viewerId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLInputElement;
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && hasPrevious && !typing) onPrevious();
      if (event.key === 'ArrowRight' && hasNext && !typing) onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasNext, hasPrevious, onClose, onNext, onPrevious]);

  const toggleLike = async () => {
    if (!canInteract) return;
    const nextLiked = !post.likedByMe;
    if (nextLiked) setLikePop((count) => count + 1);
    onChange({ likedByMe: nextLiked, likes: post.likes + (nextLiked ? 1 : -1) });
    try {
      const response = await fetch('/api/mural/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewerId, postId: post.id, like: nextLiked }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error);
      onChange({ likedByMe: data.liked, likes: data.likes });
    } catch {
      onChange({ likedByMe: post.likedByMe, likes: post.likes });
    }
  };

  // Toque duplo na foto curte (no vídeo, os toques ficam para os controles do player).
  const handlePhotoTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 320) {
      lastTap.current = 0;
      if (!canInteract) return;
      setBurst((count) => count + 1);
      if (!post.likedByMe) toggleLike();
      else setLikePop((count) => count + 1);
    } else {
      lastTap.current = now;
    }
  };

  const sendComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!text.trim() || isSending) return;
    const name = (authorName || nameDraft).trim();
    if (name.length < 2) {
      setError('Informe o seu nome para comentar.');
      return;
    }
    if (!authorName) onAuthorName(name);
    setIsSending(true);
    setError('');
    try {
      const response = await fetch('/api/mural/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewerId, name, postId: post.id, text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Não foi possível comentar.');
      setComments(data.comments);
      onChange({ comments: data.comments.length });
      setText('');
      window.setTimeout(() => listEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Não foi possível comentar.');
    } finally {
      setIsSending(false);
    }
  };

  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequestView | null>(null);
  const closeConfirm = useCallback(() => setConfirmRequest(null), []);
  const askDeleteComment = (commentId: string, remaining: number) =>
    setConfirmRequest({
      title: 'Apagar comentário?',
      message: `O seu comentário sai do post e não dá para desfazer. Você ainda tem ${formatCountdown(remaining)} para apagar; depois, só os noivos.`,
      confirmLabel: 'Apagar',
      onConfirm: () => deleteComment(commentId),
    });

  const deleteComment = async (commentId: string) => {
    const response = await fetch('/api/mural/comments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewerId, commentId }),
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.comments) {
      setComments(data.comments);
      onChange({ comments: data.comments.length });
    }
    return response.ok ? true : data?.error || false;
  };

  const arrowClass = 'absolute top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-2xl leading-none text-zinc-800 shadow-lg transition-transform hover:scale-105 sm:flex';

  return (
    <Portal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[200] flex items-stretch justify-center bg-zinc-950/85 sm:items-center sm:px-16 sm:py-8"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={`Post de ${post.authorName}`}
      >
        <button type="button" onClick={onClose} aria-label="Fechar" className="absolute right-3 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-2xl text-white hover:bg-black/70 sm:right-5 sm:top-5">
          ×
        </button>
        {hasPrevious ? (
          <button type="button" onClick={(event) => { event.stopPropagation(); onPrevious(); }} aria-label="Post anterior" className={`${arrowClass} left-3`}>
            ‹
          </button>
        ) : null}
        {hasNext ? (
          <button type="button" onClick={(event) => { event.stopPropagation(); onNext(); }} aria-label="Próximo post" className={`${arrowClass} right-3`}>
            ›
          </button>
        ) : null}

        <motion.div
          key={post.id}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          onClick={(event) => event.stopPropagation()}
          className="safari-clip flex h-full w-full max-w-6xl flex-col overflow-y-auto bg-[#fffaf1] sm:h-[88vh] sm:flex-row sm:overflow-hidden sm:rounded-[1.25rem]"
        >
          <div
            className="relative flex shrink-0 select-none items-center justify-center overscroll-x-contain bg-black sm:h-full sm:flex-1"
            // O arrastar horizontal fica com o mural (e não vira o gesto de "voltar página" do navegador).
            style={{ touchAction: 'pan-y pinch-zoom' }}
            // Celular: arrastar para os lados passa para o post anterior/próximo.
            onTouchStart={(event) => {
              touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
            }}
            onTouchEnd={(event) => {
              const start = touchStart.current;
              touchStart.current = null;
              if (!start) return;
              const dx = event.changedTouches[0].clientX - start.x;
              const dy = event.changedTouches[0].clientY - start.y;
              if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
              if (dx < 0 && hasNext) onNext();
              if (dx > 0 && hasPrevious) onPrevious();
            }}
          >
            {post.mediaType === 'video' ? (
              <video key={post.id} src={post.fullUrl} poster={post.posterUrl ?? undefined} controls playsInline autoPlay className="max-h-[70svh] w-full sm:h-full sm:max-h-none sm:object-contain" />
            ) : (
              <img
                key={post.id}
                src={post.fullUrl}
                alt={post.caption ?? `Foto de ${post.authorName}`}
                onClick={handlePhotoTap}
                draggable={false}
                className="max-h-[70svh] w-full object-contain sm:h-full sm:max-h-none"
              />
            )}
            <AnimatePresence>
              {burst > 0 ? (
                <motion.div
                  key={burst}
                  initial={{ scale: 0, opacity: 0, rotate: -12 }}
                  animate={{ scale: [0, 1.25, 0.95, 1.05, 1], opacity: [0, 1, 1, 1, 0], rotate: [-12, 6, -3, 0, 0] }}
                  transition={{ duration: 1, times: [0, 0.25, 0.45, 0.6, 1], ease: 'easeOut' }}
                  onAnimationComplete={() => setBurst(0)}
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                >
                  <BouquetIcon filled className="h-36 w-36 drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)] sm:h-44 sm:w-44" />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="flex flex-1 flex-col sm:w-[min(400px,38%)] sm:flex-none sm:min-h-0">
            <div className="flex items-center gap-3 border-b border-zinc-800/10 px-4 py-3">
              <Avatar name={post.authorName} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-800">{post.authorName}</p>
                <p className="text-xs text-zinc-500">{timeAgo(post.createdAt)}</p>
              </div>
            </div>

            <div className="flex-1 space-y-4 px-4 py-4 text-sm sm:min-h-0 sm:overflow-y-auto">
              {post.caption ? (
                <div className="flex gap-3">
                  <Avatar name={post.authorName} size="h-8 w-8" />
                  <p className="min-w-0 flex-1 whitespace-pre-line break-words text-zinc-800">
                    <span className="font-semibold">{post.authorName}</span> {post.caption}
                  </p>
                </div>
              ) : null}
              {comments === null ? <p className="text-zinc-500">Carregando comentários…</p> : null}
              {comments?.length === 0 && !post.caption ? <p className="py-6 text-center text-zinc-500">Nenhum comentário ainda.</p> : null}
              {comments?.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <Avatar name={comment.authorName} size="h-8 w-8" />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-zinc-800">
                      <span className="font-semibold">{comment.authorName}</span> {comment.text}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {timeAgo(comment.createdAt)}
                      {comment.isMine ? <DeleteCommentLink secondsLeft={comment.deleteSecondsLeft} onClick={(remaining) => askDeleteComment(comment.id, remaining)} /> : null}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={listEnd} />
            </div>

            <div className="border-t border-zinc-800/10 px-4 pt-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleLike}
                  disabled={!canInteract}
                  aria-pressed={post.likedByMe}
                  aria-label={post.likedByMe ? 'Descurtir' : 'Curtir'}
                  className={`disabled:opacity-50 ${post.likedByMe ? '' : 'text-zinc-800 hover:text-[#9e4f63]'}`}
                >
                  <motion.span
                    key={likePop}
                    className="block"
                    initial={false}
                    animate={likePop > 0 ? { scale: [1, 0.7, 1.3, 0.92, 1] } : { scale: 1 }}
                    transition={{ duration: 0.45, times: [0, 0.15, 0.45, 0.7, 1], ease: 'easeOut' }}
                  >
                    <BouquetIcon filled={post.likedByMe} className="h-9 w-9" />
                  </motion.span>
                </button>
                <p className="text-sm font-semibold text-zinc-800">
                  {post.likes} {post.likes === 1 ? 'curtida' : 'curtidas'}
                </p>
              </div>
              {canInteract ? (
                <>
                {!authorName ? <NameField id="mural-modal-name" value={nameDraft} onChange={setNameDraft} className="mt-3" /> : null}
                <form onSubmit={sendComment} className="mt-3 flex items-center gap-2">
                  <label htmlFor="mural-modal-comment" className="sr-only">
                    Comentário
                  </label>
                  <input
                    id="mural-modal-comment"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    maxLength={300}
                    autoComplete="off"
                    placeholder="Adicione um comentário…"
                    className="min-w-0 flex-1 rounded-full border border-zinc-800/15 bg-cream px-4 py-2.5 text-sm focus:border-champagne-600 focus:outline-none focus:ring-2 focus:ring-champagne-600/20"
                  />
                  <button type="submit" disabled={!text.trim() || isSending} className="px-1 text-sm font-semibold text-champagne-700 disabled:opacity-40">
                    {isSending ? '…' : 'Publicar'}
                  </button>
                </form>
                </>
              ) : null}
              {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
            </div>
          </div>
        </motion.div>
      </motion.div>
      <ConfirmPopup request={confirmRequest} onClose={closeConfirm} />
    </Portal>
  );
}

type CommentsSheetProps = {
  post: MuralPostView;
  viewerId: string;
  authorName: string;
  onAuthorName: (name: string) => void;
  canInteract: boolean;
  onClose: () => void;
  onCountChange: (count: number) => void;
};

/** Comentários de um post: sobe de baixo no celular, janela no computador. */
function CommentsSheet({ post, viewerId, authorName, onAuthorName, canInteract, onClose, onCountChange }: CommentsSheetProps) {
  const [comments, setComments] = useState<MuralCommentView[] | null>(null);
  const [text, setText] = useState('');
  // Sem nome lembrado: pede o nome junto do comentário (só na primeira vez).
  const [nameDraft, setNameDraft] = useState(authorName);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const listEnd = useRef<HTMLDivElement>(null);
  useLockScroll(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/mural/comments?postId=${post.id}&viewerId=${encodeURIComponent(viewerId)}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setComments(Array.isArray(data?.comments) ? data.comments : []);
      })
      .catch(() => !cancelled && setComments([]));
    return () => {
      cancelled = true;
    };
  }, [post.id, viewerId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sendComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!text.trim() || isSending) return;
    const name = (authorName || nameDraft).trim();
    if (name.length < 2) {
      setError('Informe o seu nome para comentar.');
      return;
    }
    if (!authorName) onAuthorName(name);
    setIsSending(true);
    setError('');
    try {
      const response = await fetch('/api/mural/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewerId, name, postId: post.id, text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Não foi possível comentar.');
      setComments(data.comments);
      onCountChange(data.comments.length);
      setText('');
      window.setTimeout(() => listEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Não foi possível comentar.');
    } finally {
      setIsSending(false);
    }
  };

  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequestView | null>(null);
  const closeConfirm = useCallback(() => setConfirmRequest(null), []);
  const askDeleteComment = (commentId: string, remaining: number) =>
    setConfirmRequest({
      title: 'Apagar comentário?',
      message: `O seu comentário sai do post e não dá para desfazer. Você ainda tem ${formatCountdown(remaining)} para apagar; depois, só os noivos.`,
      confirmLabel: 'Apagar',
      onConfirm: () => deleteComment(commentId),
    });

  const deleteComment = async (commentId: string) => {
    const response = await fetch('/api/mural/comments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewerId, commentId }),
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.comments) {
      setComments(data.comments);
      onCountChange(data.comments.length);
    }
    return response.ok ? true : data?.error || false;
  };

  return (
    <Portal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[200] flex items-end justify-center bg-zinc-950/50 backdrop-blur-[2px] sm:items-center sm:p-6"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="comments-title"
      >
        <motion.div
          initial={{ y: 60 }}
          animate={{ y: 0 }}
          exit={{ y: 60 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          onClick={(event) => event.stopPropagation()}
          className="flex max-h-[80svh] w-full max-w-lg flex-col rounded-t-[1.75rem] bg-[#fffaf1] shadow-2xl sm:max-h-[80vh] sm:rounded-[1.75rem]"
        >
          <div className="relative border-b border-zinc-800/10 px-5 pb-3 pt-3 text-center">
            <span className="mx-auto mb-2 block h-1 w-10 rounded-full bg-zinc-800/20 sm:hidden" aria-hidden="true" />
            <p id="comments-title" className="text-sm font-semibold text-zinc-800">
              Comentários
            </p>
            <button type="button" onClick={onClose} aria-label="Fechar" className="absolute right-3 top-2 h-9 w-9 rounded-full text-2xl leading-none text-zinc-500 hover:bg-zinc-800/5">
              ×
            </button>
          </div>

          <div className="min-h-[8rem] flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
            {post.caption ? (
              <div className="flex gap-3 border-b border-zinc-800/10 pb-4">
                <Avatar name={post.authorName} size="h-8 w-8" />
                <p className="min-w-0 flex-1 break-words text-zinc-800">
                  <span className="font-semibold">{post.authorName}</span> {post.caption}
                </p>
              </div>
            ) : null}
            {comments === null ? <p className="text-zinc-500">Carregando comentários…</p> : null}
            {comments?.length === 0 ? <p className="py-6 text-center text-zinc-500">Nenhum comentário ainda. Seja o primeiro!</p> : null}
            {comments?.map((comment) => (
              <div key={comment.id} className="flex gap-3">
                <Avatar name={comment.authorName} size="h-8 w-8" />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-zinc-800">
                    <span className="font-semibold">{comment.authorName}</span> {comment.text}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {timeAgo(comment.createdAt)}
                    {comment.isMine ? <DeleteCommentLink secondsLeft={comment.deleteSecondsLeft} onClick={(remaining) => askDeleteComment(comment.id, remaining)} /> : null}
                  </p>
                </div>
              </div>
            ))}
            <div ref={listEnd} />
          </div>

          {canInteract && !authorName ? (
            <NameField id="mural-sheet-name" value={nameDraft} onChange={setNameDraft} className="border-t border-zinc-800/10 px-4 pt-3" />
          ) : null}
          {canInteract ? (
            <form
              onSubmit={sendComment}
              className={`flex items-center gap-2 px-4 pt-3 ${authorName ? 'border-t border-zinc-800/10' : ''}`}
              style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
            >
              <label htmlFor="mural-comment" className="sr-only">
                Comentário
              </label>
              <input
                id="mural-comment"
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={300}
                autoComplete="off"
                placeholder="Adicione um comentário…"
                className="min-w-0 flex-1 rounded-full border border-zinc-800/15 bg-cream px-4 py-2.5 text-sm focus:border-champagne-600 focus:outline-none focus:ring-2 focus:ring-champagne-600/20"
              />
              <button type="submit" disabled={!text.trim() || isSending} className="px-1 text-sm font-semibold text-champagne-700 disabled:opacity-40">
                {isSending ? '…' : 'Publicar'}
              </button>
            </form>
          ) : (
            <p className="border-t border-zinc-800/10 px-5 py-3 text-center text-xs text-zinc-500">Os comentários abrem junto com o mural.</p>
          )}
          {error ? <p className="px-5 pb-3 text-xs text-rose-700">{error}</p> : null}
        </motion.div>
      </motion.div>
      <ConfirmPopup request={confirmRequest} onClose={closeConfirm} />
    </Portal>
  );
}

type Picked = { file: File; kind: 'image' | 'video'; previewUrl: string; duration: number | null; width: number | null; height: number | null };

/** Janela de postar: escolher/tirar foto ou vídeo, legenda e envio com progresso. */
function Composer({
  viewerId,
  authorName,
  onAuthorName,
  onClose,
  onPosted,
}: {
  viewerId: string;
  authorName: string;
  onAuthorName: (name: string) => void;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [caption, setCaption] = useState('');
  // Mural aberto: quem publica só informa o nome (vem preenchido com o último usado neste aparelho).
  const [name, setName] = useState(authorName);
  const [progress, setProgress] = useState<number | null>(null);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  // Abre direto na câmera (como no Instagram), se o aparelho tiver; senão, escolher arquivo.
  const [showCamera, setShowCamera] = useState(() => isCameraSupported());
  const isUploading = progress !== null;
  useLockScroll(true);

  useEffect(() => () => {
    if (picked) URL.revokeObjectURL(picked.previewUrl);
  }, [picked]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isUploading) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isUploading, onClose]);

  const pickFile = async (file: File | undefined) => {
    setError('');
    if (!file) return;
    const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name) ? 'image' : null;
    if (!kind) {
      setShowCamera(false);
      setError('Escolha uma foto ou um vídeo.');
      return;
    }
    if (kind === 'video' && file.size > MAX_VIDEO_BYTES) {
      setShowCamera(false);
      setError('Vídeo muito grande (máximo 100 MB). Grave um vídeo mais curto ou corte antes de enviar.');
      return;
    }
    const meta = kind === 'video' ? await readVideoMeta(file) : { duration: null, width: null, height: null };
    setPicked({ file, kind, previewUrl: URL.createObjectURL(file), ...meta });
    setShowCamera(false);
  };

  const retake = () => {
    setPicked(null);
    setError('');
    if (isCameraSupported()) setShowCamera(true);
    else inputRef.current?.click();
  };

  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequestView | null>(null);
  const closeConfirm = useCallback(() => setConfirmRequest(null), []);

  // Segunda confirmação: depois de publicado, o convidado não consegue apagar (só o admin).
  const askPublish = () => {
    if (!picked || isUploading) return;
    if (name.trim().length < 2) {
      setError('Informe o seu nome para publicar.');
      document.getElementById('composer-name')?.focus();
      return;
    }
    setError('');
    setConfirmRequest({
      title: picked.kind === 'video' ? 'Publicar este vídeo?' : 'Publicar esta foto?',
      message: 'Ele aparece na hora para todos os convidados. Você terá só 2 minutos para apagar, se precisar; depois disso, não será mais possível (só os noivos podem apagar).',
      confirmLabel: 'Publicar',
      tone: 'primary',
      onConfirm: async () => {
        void publish();
        return true;
      },
    });
  };

  const publish = async () => {
    if (!picked || isUploading) return;
    const trimmedName = name.trim();
    if (trimmedName.length < 2) return;
    onAuthorName(trimmedName);
    setError('');
    setProgress(0);
    try {
      let upload: Blob = picked.file;
      let width = picked.width;
      let height = picked.height;
      if (picked.kind === 'image') {
        setStage('Preparando a foto…');
        const compressed = await compressImage(picked.file);
        upload = compressed.blob;
        width = compressed.width ?? width;
        height = compressed.height ?? height;
        if (upload.size > MAX_IMAGE_BYTES) throw new Error('Foto muito grande (máximo 10 MB).');
      }

      setStage('Enviando…');
      const signResponse = await fetch('/api/mural/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewerId, name: trimmedName, kind: picked.kind }),
      });
      const sign = await signResponse.json();
      if (!signResponse.ok) throw new Error(sign?.error || 'Não foi possível preparar o envio.');

      const fileName = picked.kind === 'image' && upload !== picked.file ? 'foto.jpg' : picked.file.name || 'arquivo';
      const result = await uploadToCloudinary(upload, fileName, sign, (fraction) => setProgress(fraction));

      setStage('Publicando…');
      const response = await fetch('/api/mural/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viewerId,
          name: trimmedName,
          // Se a pessoa também entrou com o código do convite, o post fica ligado a ele (só referência).
          code: readStoredCode() || undefined,
          publicId: result.public_id,
          version: result.version,
          signature: result.signature,
          resourceType: result.resource_type,
          width: result.width ?? width,
          height: result.height ?? height,
          duration: result.duration ?? picked.duration,
          caption,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Não foi possível publicar.');
      onPosted();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Não foi possível publicar.');
      setProgress(null);
      setStage('');
    }
  };

  const percent = useMemo(() => Math.round((progress ?? 0) * 100), [progress]);

  return (
    <Portal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[200] flex items-end justify-center bg-zinc-950/60 backdrop-blur-sm sm:items-center sm:p-6"
        onClick={() => (isUploading ? undefined : onClose())}
        role="dialog"
        aria-modal="true"
        aria-labelledby="composer-title"
      >
        <motion.div
          initial={{ y: 40 }}
          animate={{ y: 0 }}
          exit={{ y: 40 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          onClick={(event) => event.stopPropagation()}
          className="max-h-[92svh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-[#fffaf1] p-6 shadow-2xl sm:rounded-[2rem] sm:p-8"
          style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className={EYEBROW}>Mural do casamento</p>
              <h2 id="composer-title" className="mt-2 font-display text-4xl italic leading-none text-zinc-800">
                Novo post
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              aria-label="Fechar"
              className="-mr-2 -mt-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-3xl leading-none text-zinc-600 transition-colors hover:bg-zinc-800/5 disabled:opacity-40"
            >
              ×
            </button>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(event) => {
              pickFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          {showCamera && !picked ? (
            <CameraCapture onCapture={(file) => pickFile(file)} onGallery={() => inputRef.current?.click()} onClose={onClose} />
          ) : null}

          {picked ? (
            <div className="safari-clip relative mt-6 overflow-hidden rounded-2xl bg-black">
              {picked.kind === 'video' ? (
                <video src={picked.previewUrl} controls playsInline className="max-h-[45svh] w-full" />
              ) : (
                <img src={picked.previewUrl} alt="Pré-visualização" className="max-h-[45svh] w-full object-contain" />
              )}
              {!isUploading ? (
                <button type="button" onClick={retake} className="absolute bottom-3 right-3 rounded-full bg-white/90 px-4 py-2 text-xs font-medium text-zinc-800 shadow">
                  Refazer
                </button>
              ) : null}
            </div>
          ) : (
            <div className="mt-6 grid gap-3">
            {isCameraSupported() ? (
              <button
                type="button"
                onClick={() => setShowCamera(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-champagne-600 px-6 py-4 text-sm font-medium text-[#fff9f1] transition-opacity hover:opacity-90"
              >
                Abrir a câmera
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-zinc-800/20 bg-cream px-6 py-10 text-center transition-colors hover:border-champagne-600/50"
            >
              <svg viewBox="0 0 24 24" className="h-10 w-10 text-champagne-600" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.7l1.2-1.6c.3-.4.8-.6 1.3-.6h2.6c.5 0 1 .2 1.3.6L15.8 6h1.7A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-8Z" strokeLinejoin="round" />
                <circle cx="12" cy="12.5" r="3.5" />
              </svg>
              <span className="text-sm font-medium text-zinc-800">Escolher da galeria</span>
              <span className="text-xs text-zinc-500">Fotos ou vídeos de até 100 MB</span>
            </button>
            </div>
          )}

          <label htmlFor="composer-name" className={`${EYEBROW} mt-6 block`}>
            Seu nome
          </label>
          <input
            id="composer-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError('');
            }}
            maxLength={60}
            autoComplete="name"
            disabled={isUploading}
            placeholder="Como você quer aparecer no mural"
            className="w-full rounded-2xl border border-zinc-800/15 bg-cream px-5 py-3 text-sm text-zinc-800 placeholder:text-zinc-500 focus:border-champagne-600 focus:outline-none focus:ring-2 focus:ring-champagne-600/20 mt-2"
          />

          <label htmlFor="composer-caption" className={`${EYEBROW} mt-5 block`}>
            Legenda <span className="normal-case tracking-normal text-zinc-500">(opcional)</span>
          </label>
          <textarea
            id="composer-caption"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            maxLength={300}
            rows={2}
            disabled={isUploading}
            placeholder="Escreva algo sobre este momento…"
            className={`${FIELD} mt-2 resize-none`}
          />

          {isUploading ? (
            <div className="mt-5" aria-live="polite">
              <div className="flex justify-between text-xs text-zinc-600">
                <span>{stage}</span>
                <span>{percent}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800/10">
                <div className="h-full rounded-full bg-champagne-600 transition-[width] duration-200" style={{ width: `${percent}%` }} />
              </div>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="mt-4 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={isUploading} className={SECONDARY}>
              Cancelar
            </button>
            <button type="button" onClick={askPublish} disabled={!picked || isUploading} className={PRIMARY}>
              {isUploading ? 'Publicando…' : 'Publicar'}
            </button>
          </div>
        </motion.div>
      </motion.div>
      <ConfirmPopup request={confirmRequest} onClose={closeConfirm} />
    </Portal>
  );
}
