"use client";

import { AnimatePresence, motion } from 'framer-motion';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Portal } from '@/components/home/portal';
import { Reveal } from '@/components/home/reveal';
import { SiteHeader } from '@/components/home/site-header';
import { CameraCapture, isCameraSupported } from '@/components/mural/camera-capture';
import { EmojiPicker } from '@/components/emoji-picker';
import { PhotoEditor, muralCardRatio, muralObjectPosition, type PhotoEditResult, type PhotoEditState, type VideoCrop, type VideoCropResult } from '@/components/mural/photo-editor';
import { INTRO_HOME_HREF } from '@/components/intro-arco';
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_MEDIA_PER_POST,
  compressImage,
  initials,
  getViewerId,
  readAuthorName,
  readStoredCode,
  readVideoMeta,
  storeAuthorName,
  timeAgo,
  uploadToCloudinary,
  type MuralAdminView,
  type MuralAuthorRole,
  type MuralCommentView,
  type MuralMediaItemView,
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
// Atualização quase em tempo real: posts, curtidas e comentários (só enquanto a página está na tela).
const REFRESH_MS = 5_000;
/** Posts por página (o resto carrega ao rolar, como no Instagram). */
const PAGE_SIZE = 12;
/** Intervalo mínimo entre dois downloads de novidades (no pico da festa, várias mudanças viram um download só). */
const UPDATES_MIN_GAP_MS = 8_000;
const COMMENTS_REFRESH_MS = 4_000;

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

function Avatar({ name, size = 'h-9 w-9', role = null }: { name: string; size?: string; role?: MuralAuthorRole | null }) {
  return (
    <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-champagne-600/15 text-xs font-semibold text-champagne-700`} aria-hidden="true">
      {/* Noivo/noiva: gravata ou laço no lugar das iniciais. */}
      {role === 'noivo' ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
          <path d="M9 2h6l-1.4 4.2h-3.2L9 2Z" fill="currentColor" />
          <path d="M10.4 7.4h3.2l2.6 10.1L12 22l-4.2-4.5 2.6-10.1Z" fill="currentColor" />
        </svg>
      ) : role === 'noiva' ? (
        <svg viewBox="0 0 28 24" className="h-5 w-6" aria-hidden="true">
          <path d="M12 10.5C9.5 6 3.5 3.5 2 5.5c-1.5 2 .2 9 2.7 10.2 2.4 1.1 6.3-1.3 7.3-3.2v-2Z" fill="currentColor" />
          <path d="M16 10.5c2.5-4.5 8.5-7 10-5 1.5 2-.2 9-2.7 10.2-2.4 1.1-6.3-1.3-7.3-3.2v-2Z" fill="currentColor" />
          <path d="M12.5 13.5 9.5 22l2.4-1.2 1.2 2.2 1-8.5h-1.6Zm3 0 3 8.5-2.4-1.2-1.2 2.2-1-8.5h1.6Z" fill="currentColor" opacity="0.85" />
          <rect x="11.3" y="8.7" width="5.4" height="5.6" rx="2.2" fill="currentColor" />
        </svg>
      ) : (
        initials(name)
      )}
    </span>
  );
}

/** Selo "Noivo" ou "Noiva" ao lado do nome, nos posts do casal (o ícone fica no círculo do usuário). */
function RoleBadge({ role }: { role: MuralAuthorRole }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
        // Mesmas cores da moldura de cada um: ouro rosé (noiva) e ouro com oliva (noivo).
        role === 'noiva'
          ? 'from-[#f6d6d0] to-[#dca196] text-[#7a3546] shadow-[0_2px_8px_rgba(170,90,95,0.3)]'
          : 'from-[#eadbab] to-[#c3a35e] text-[#3a4526] shadow-[0_2px_8px_rgba(110,120,70,0.3)]'
      }`}
    >
      {role === 'noivo' ? 'Noivo' : 'Noiva'}
    </span>
  );
}

// Molduras dos posts do noivo e da noiva: uma divisória fina logo acima e outra logo abaixo da foto, quase
// encostando nela, no próprio card (a foto fica inteira, no celular e no computador). Mesma estrutura, detalhes próprios:
// - noiva: linha em ouro rosé com espirais nas pontas e um ramo de florzinhas brancas no meio;
// - noivo: linha em dourado com oliva, volutinhas com folha nas pontas e um enfeite de volutas no meio.
type FrameTheme = {
  ornament: string;
  accent: string;
};

const FRAME_THEMES: Record<MuralAuthorRole, FrameTheme> = {
  noiva: { ornament: '#bf7f72', accent: '#c97a8a' },
  noivo: { ornament: '#7d7a47', accent: '#a88b4c' },
};

/** Espiral da ponta da divisória da noiva (desenhada para a ponta esquerda, curvando para baixo). */
function BrideCurl({ color, className }: { color: string; className: string }) {
  return (
    <svg viewBox="0 0 22 20" className={`h-5 w-[22px] shrink-0 ${className}`} aria-hidden="true">
      <path d="M22 5H9C4.5 5 2.5 8.6 3.2 11.8c.7 3.2 4.6 4.2 6.3 1.8 1.4-1.9.3-4.4-1.9-4.1-1.5.2-2 1.7-1.3 2.6" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="6.4" cy="12.2" r="1.1" fill={color} />
    </svg>
  );
}

/** Ramo central da divisória da noiva: florzinhas brancas, botões e folhinhas, espelhados. */
function BrideRoses({ line }: { line: string }) {
  // Florzinha branca de cinco pétalas, com contorno rosé bem leve (para aparecer no fundo rosado) e miolo dourado.
  const flower = (cx: number, r: number) => {
    const petal = r * 0.52;
    const distance = r * 0.55;
    return (
      <g key={`flor-${cx}`}>
        {[0, 1, 2, 3, 4].map((index) => {
          const angle = (index * 72 - 90) * (Math.PI / 180);
          return (
            <circle
              key={index}
              cx={cx + Math.cos(angle) * distance}
              cy={9 + Math.sin(angle) * distance}
              r={petal}
              fill="#ffffff"
              stroke="#e3b2a9"
              strokeWidth="0.55"
            />
          );
        })}
        <circle cx={cx} cy="9" r={r * 0.28} fill="#e2b85f" />
      </g>
    );
  };
  const leaf = (x: number, flip: boolean, up: boolean) => (
    <path
      key={`folha-${x}-${up}`}
      d={`M${x} 9c${flip ? -2 : 2} ${up ? -4.5 : 4.5} ${flip ? -6 : 6} ${up ? -5 : 5} ${flip ? -8 : 8} ${up ? -3.5 : 3.5}c${flip ? 2.6 : -2.6} ${up ? 3 : -3} ${flip ? 5.8 : -5.8} ${up ? 3.6 : -3.6} ${flip ? 8 : -8} ${up ? 3.5 : -3.5}Z`}
      fill={LEAF}
    />
  );
  return (
    <svg viewBox="0 0 120 18" className="h-[18px] w-[120px] shrink-0" aria-hidden="true">
      <path d="M0 9h120" stroke={line} strokeWidth="1.5" />
      {[leaf(30, true, true), leaf(30, true, false), leaf(90, false, true), leaf(90, false, false), leaf(46, true, false), leaf(74, false, true)]}
      {[flower(51, 7), flower(69, 7), flower(37, 4.6), flower(83, 4.6)]}
      {/* Botões brancos */}
      <circle cx="23" cy="9" r="2.2" fill="#ffffff" stroke="#e3b2a9" strokeWidth="0.55" />
      <circle cx="97" cy="9" r="2.2" fill="#ffffff" stroke="#e3b2a9" strokeWidth="0.55" />
      <circle cx="16" cy="9" r="1.2" fill={line} />
      <circle cx="104" cy="9" r="1.2" fill={line} />
    </svg>
  );
}

/**
 * Divisória da noiva (acima e abaixo da foto, quase encostando nela): linha fina em ouro rosé com espirais nas
 * pontas e um ramo de florzinhas brancas no meio. Embaixo ela é espelhada (as espirais curvam para cima, na direção da foto).
 */
function BrideDivider({ position }: { position: 'top' | 'bottom' }) {
  const color = FRAME_THEMES.noiva.ornament;
  const isTop = position === 'top';
  return (
    <div className={`flex h-5 items-start px-2 ${isTop ? 'mb-[3px]' : 'mt-[3px] -scale-y-100'}`} aria-hidden="true">
      <BrideCurl color={color} className="" />
      <span className="mt-[4.25px] h-[1.5px] flex-1" style={{ backgroundColor: color }} />
      {/* O caule das rosas (y=9) fica na mesma altura da linha (y=5). */}
      <span className="-mt-1 flex items-start">
        <BrideRoses line={color} />
      </span>
      <span className="mt-[4.25px] h-[1.5px] flex-1" style={{ backgroundColor: color }} />
      <BrideCurl color={color} className="-scale-x-100" />
    </div>
  );
}

/** Ponta da divisória do noivo: volutinha com uma folha (desenhada para a ponta esquerda). */
function GroomEnd({ color, className }: { color: string; className: string }) {
  return (
    <svg viewBox="0 0 26 20" className={`h-5 w-[26px] shrink-0 ${className}`} aria-hidden="true">
      <path d="M26 6H12" stroke={color} strokeWidth="1.5" />
      <path d="M12 6c-3 0-5.2 1.4-6.6 3.4-1.5 2.2-.8 5 1.6 5.4 2 .3 3.1-1.5 2.3-3-.6-1-2-1.1-2.6-.2" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12.5 6c-2.6-3.2-6.8-4.2-9.6-2.6 2.4 2.6 6.1 3.5 9.6 2.6Z" fill={color} />
      <circle cx="2.4" cy="8.4" r="1.2" fill={color} />
    </svg>
  );
}

/** Enfeite central da divisória do noivo: volutas espelhadas curvando para baixo, folhas e um botão no meio. */
function GroomCenter({ color, accent }: { color: string; accent: string }) {
  const half = (
    <>
      <path d="M35 6c-4.2 0-8.4 1.5-10.4 4.6-1.9 3 0 6.4 3 6.2 2.4-.2 3.3-2.7 1.8-4-1.2-1-2.9-.3-2.9 1" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M33.5 6c-3.2-2.8-7.6-3.4-10.4-1.7 2.8 2.3 6.6 3 10.4 1.7Z" fill={color} />
      <path d="M22 6c-2.4 1-3.6 3-3.2 5 1.9-.7 3.1-2.6 3.2-5Z" fill={color} opacity="0.85" />
    </>
  );
  return (
    <svg viewBox="0 0 70 20" className="h-5 w-[70px] shrink-0" aria-hidden="true">
      <path d="M0 6h70" stroke={color} strokeWidth="1.5" />
      {half}
      <g transform="translate(70 0) scale(-1 1)">{half}</g>
      <path d="M35 3.2c-2.1 2.6-2.1 6.2 0 9.4 2.1-3.2 2.1-6.8 0-9.4Z" fill={color} />
      <circle cx="35" cy="15.6" r="1.6" fill={accent} />
    </svg>
  );
}

/**
 * Divisória do noivo (acima e abaixo da foto, quase encostando nela): linha fina em dourado com oliva, volutinhas
 * nas pontas e o enfeite de volutas no meio. Embaixo ela é espelhada (as volutas curvam para cima, na direção da foto).
 */
function GroomDivider({ position }: { position: 'top' | 'bottom' }) {
  const { ornament, accent } = FRAME_THEMES.noivo;
  const isTop = position === 'top';
  return (
    <div className={`flex h-5 items-start px-2 ${isTop ? 'mb-[3px]' : 'mt-[3px] -scale-y-100'}`} aria-hidden="true">
      <GroomEnd color={ornament} className="" />
      <span className="mt-[5.25px] h-[1.5px] flex-1" style={{ backgroundColor: ornament }} />
      <GroomCenter color={ornament} accent={accent} />
      <span className="mt-[5.25px] h-[1.5px] flex-1" style={{ backgroundColor: ornament }} />
      <GroomEnd color={ornament} className="-scale-x-100" />
    </div>
  );
}

/** Faixa da moldura (acima ou abaixo da foto), no estilo de cada um. */
function FrameBand({ role, position }: { role: MuralAuthorRole; position: 'top' | 'bottom' }) {
  return role === 'noiva' ? <BrideDivider position={position} /> : <GroomDivider position={position} />;
}

/** Moldura dos posts do noivo/noiva: faixas acima e abaixo da foto. Posts de convidados passam direto. */
function CoupleFrame({ role, children }: { role: MuralAuthorRole | null; children: React.ReactNode }) {
  if (!role) return <>{children}</>;
  return (
    <>
      <FrameBand role={role} position="top" />
      {children}
      <FrameBand role={role} position="bottom" />
    </>
  );
}

/** Nome de quem postou, com o selo quando é o noivo ou a noiva. */
function AuthorName({ name, role }: { name: string; role: MuralAuthorRole | null }) {
  return (
    <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-zinc-800">
      <span className="truncate">{name}</span>
      {role ? <RoleBadge role={role} /> : null}
    </p>
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
  // Noivo/noiva logados no painel neste navegador: publicam com o próprio nome e em destaque.
  const [viewerAdmin, setViewerAdmin] = useState<MuralAdminView | null>(null);
  const viewerAdminRef = useRef<MuralAdminView | null>(null);
  const [settings, setSettings] = useState<MuralSettingsView | null>(null);
  const [posts, setPosts] = useState<MuralPostView[]>([]);
  const postsRef = useRef<MuralPostView[]>([]);
  postsRef.current = posts;
  // Publicações novas que chegaram enquanto a pessoa lia lá embaixo (aparecem ao tocar no aviso).
  const [pendingPosts, setPendingPosts] = useState<MuralPostView[]>([]);
  const pendingRef = useRef<MuralPostView[]>([]);
  pendingRef.current = pendingPosts;
  const pendingCount = pendingPosts.length;
  const showPending = () => {
    setPosts((current) => mergeNewPosts(pendingRef.current, current));
    setPendingPosts([]);
    window.scrollTo({ top: Math.max(0, (document.querySelector('[aria-label="Posts do mural"]') as HTMLElement | null)?.offsetTop ?? 0) - 80, behavior: 'smooth' });
  };
  // Rolagem infinita: há mais posts antigos para buscar?
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
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
    // O nome do noivo/noiva vem do login; não substitui o nome lembrado para quando sair do painel.
    if (!viewerAdminRef.current) storeAuthorName(name);
  }, []);

  // 1ª página do mural (os mais recentes); o resto vem ao rolar.
  const loadFeed = useCallback(
    async (silent = false) => {
      if (!viewerId) return;
      if (!silent) setIsLoading(true);
      try {
        const inviteCode = readStoredCode();
        const query = new URLSearchParams({ viewerId, limit: String(PAGE_SIZE) });
        if (inviteCode) query.set('code', inviteCode);
        const response = await fetch(`/api/mural?${query.toString()}`, { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || 'Erro ao carregar o mural.');
        setSettings(data.settings);
        const serverPosts: MuralPostView[] = Array.isArray(data.posts) ? data.posts : [];
        setPosts(serverPosts);
        setPendingPosts([]);
        setHasMore(Boolean(data.hasMore));
        const admin: MuralAdminView | null = data.viewerAdmin ?? null;
        viewerAdminRef.current = admin;
        setViewerAdmin(admin);
        if (admin) setAuthorName(admin.name);
        // Quem entrou com o código do convite já vem com o nome sugerido.
        else if (data.suggestedName && !readAuthorName()) setAuthorName(data.suggestedName);
        setLoadError('');
      } catch (error) {
        if (!silent) setLoadError(error instanceof Error ? error.message : 'Erro ao carregar o mural.');
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [viewerId]
  );

  // Mais posts antigos ao chegar perto do fim da lista.
  const loadMore = useCallback(async () => {
    if (!viewerId || loadingMoreRef.current) return;
    const last = postsRef.current[postsRef.current.length - 1];
    if (!last) return;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const query = new URLSearchParams({ viewerId, limit: String(PAGE_SIZE), before: last.id });
      const response = await fetch(`/api/mural?${query.toString()}`, { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.posts)) throw new Error();
      const page: MuralPostView[] = data.posts;
      setPosts((current) => {
        const known = new Set(current.map((post) => post.id));
        return [...current, ...page.filter((post) => !known.has(post.id))];
      });
      setHasMore(Boolean(data.hasMore));
    } catch {
      // Tenta de novo na próxima vez que a pessoa chegar ao fim.
    } finally {
      loadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [viewerId]);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && void loadMore(), { rootMargin: '1200px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, posts.length]);

  // Novidades (posts novos e curtidas/comentários dos posts na tela), sem baixar o mural inteiro de novo.
  const lastUpdateAt = useRef(0);
  const updatingRef = useRef(false);
  const fetchUpdates = useCallback(async () => {
    if (!viewerId || updatingRef.current) return false;
    updatingRef.current = true;
    lastUpdateAt.current = Date.now();
    try {
      const loaded = postsRef.current;
      const newest = [...pendingRef.current, ...loaded].reduce((max, post) => (Number(post.id) > max ? Number(post.id) : max), 0);
      const response = await fetch('/api/mural/updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewerId, after: String(newest), ids: idsNearScreen(loaded) }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) return false;
      if (data.settings) setSettings(data.settings);
      const updated = new Map<string, MuralPostView>((data.updated ?? []).map((post: MuralPostView) => [post.id, post]));
      const removed = new Set<string>(data.removed ?? []);
      const fresh: MuralPostView[] = Array.isArray(data.posts) ? data.posts : [];
      setPosts((current) => {
        const next = current.filter((post) => !removed.has(post.id)).map((post) => updated.get(post.id) ?? post);
        // No topo: as novas entram direto; lendo lá embaixo: esperam o aviso (a lista não pula).
        return fresh.length && window.scrollY <= 400 ? mergeNewPosts(fresh, next) : next;
      });
      if (fresh.length && window.scrollY > 400) setPendingPosts((current) => mergeNewPosts(fresh, current));
      return true;
    } catch {
      return false;
    } finally {
      updatingRef.current = false;
    }
  }, [viewerId]);

  useEffect(() => {
    if (!viewerId) return;
    void loadFeed();
    let version: string | null = null;
    let waiting = false;
    // Pulso: pergunta "mudou algo?" (resposta de poucos bytes); só baixa novidades quando mudou.
    const tick = async () => {
      if (document.visibilityState !== 'visible' || waiting) return;
      waiting = true;
      try {
        const response = await fetch('/api/mural/pulse', { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        const next = typeof data?.version === 'string' ? data.version : null;
        if (!next) return;
        if (version === null) version = next;
        else if (next !== version && Date.now() - lastUpdateAt.current >= UPDATES_MIN_GAP_MS) {
          if (await fetchUpdates()) version = next;
        }
      } catch {
        // Sem conexão momentânea: tenta no próximo pulso.
      } finally {
        waiting = false;
      }
    };
    const timer = window.setInterval(() => void tick(), REFRESH_MS);
    // Voltou para a aba: confere na hora.
    const onVisible = () => document.visibilityState === 'visible' && void tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [viewerId, loadFeed, fetchUpdates]);

  const commentsPost = posts.find((post) => post.id === commentsPostId) ?? null;
  const viewerIndex = posts.findIndex((post) => post.id === viewerPostId);
  const viewerPost = viewerIndex >= 0 ? posts[viewerIndex] : null;
  const updatePost = (id: string, patch: Partial<MuralPostView>) =>
    setPosts((current) => current.map((post) => (post.id === id ? { ...post, ...patch } : post)));
  const canInteract = Boolean(settings?.isOpen);

  if (viewerId === null) return <main className="min-h-screen bg-cream" />;

  return (
    <main className="relative min-h-screen bg-cream px-4 pb-32 pt-8 text-zinc-800 sm:px-6 md:px-10">
      {/* No mural não há o botão "Confirmar presença" (ele fica só no início e na lista de presentes). */}
      <SiteHeader links={NAV_LINKS} alwaysDark />

      {/* Publicações novas chegaram enquanto a pessoa lia lá embaixo (como no Instagram). */}
      <AnimatePresence>
        {pendingCount > 0 ? (
          <motion.button
            key="novas"
            type="button"
            onClick={showPending}
            initial={{ opacity: 0, y: -16, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -16, x: '-50%' }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-1/2 top-20 z-[60] inline-flex items-center gap-2 rounded-full bg-champagne-600 px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-[#fff9f1] shadow-[0_12px_30px_rgba(47,36,27,0.28)]"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
              <path d="M12 19V5M6 11l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {pendingCount === 1 ? '1 nova publicação' : `${pendingCount} novas publicações`}
          </motion.button>
        ) : null}
      </AnimatePresence>

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
            {/* Fim da lista: perto daqui, carrega os próximos posts. */}
            <div ref={sentinelRef} aria-hidden="true" />
            {isLoadingMore ? <p className="py-6 text-center text-sm text-zinc-500">Carregando mais posts…</p> : null}
            {!hasMore && posts.length > PAGE_SIZE ? <p className="py-6 text-center text-xs uppercase tracking-[0.2em] text-zinc-400">Você viu todos os posts</p> : null}
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
            viewerAdmin={viewerAdmin}
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

// Emojis do seletor dos comentários: os mais usados em casamento primeiro.
const COMMENT_EMOJIS = [
  '❤️', '😍', '🥰', '😘', '🤗', '😭', '😂', '🤣',
  '😊', '😁', '🤩', '😎', '👏', '🙌', '🙏', '👍',
  '🎉', '🥳', '🥂', '🍾', '💃', '🕺', '🎶', '📸',
  '💍', '💒', '👰', '🤵', '💐', '🌹', '🌸', '🌷',
  '🤍', '💕', '💖', '💞', '✨', '🌟', '🔥', '💯',
];

/** Campo de comentário com botão de emojis: o emoji escolhido entra onde estiver o cursor. */
function CommentInput({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Fecha o seletor ao tocar fora dele ou com Esc.
  useEffect(() => {
    if (!isOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [isOpen]);

  const insert = (emoji: string) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    const next = (value.slice(0, start) + emoji + value.slice(end)).slice(0, 300);
    onChange(next);
    // Devolve o cursor para logo depois do emoji (sem abrir o teclado do celular à toa).
    requestAnimationFrame(() => {
      if (!input) return;
      const caret = Math.min(start + emoji.length, next.length);
      input.setSelectionRange(caret, caret);
    });
  };

  return (
    <div ref={boxRef} className="relative min-w-0 flex-1">
      <input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={300}
        autoComplete="off"
        placeholder="Adicione um comentário…"
        className="w-full rounded-full border border-zinc-800/15 bg-cream py-2.5 pl-4 pr-11 text-sm focus:border-champagne-600 focus:outline-none focus:ring-2 focus:ring-champagne-600/20"
      />
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label="Inserir emoji"
        aria-expanded={isOpen}
        className={`absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full transition-colors hover:bg-zinc-800/5 ${
          isOpen ? 'text-champagne-700' : 'text-zinc-500'
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 14.5c.9 1.3 2.1 2 3.5 2s2.6-.7 3.5-2" />
          <circle cx="9" cy="10" r="0.6" fill="currentColor" />
          <circle cx="15" cy="10" r="0.6" fill="currentColor" />
        </svg>
      </button>
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            role="listbox"
            aria-label="Emojis"
            className="absolute bottom-full right-0 z-30 mb-2 grid w-[17.5rem] max-w-[calc(100vw-2rem)] grid-cols-8 gap-0.5 rounded-2xl border border-zinc-800/10 bg-[#fffaf1] p-2 shadow-[0_18px_40px_rgba(47,36,27,0.18)]"
          >
            {COMMENT_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => insert(emoji)}
                className="flex h-8 items-center justify-center rounded-lg text-xl leading-none transition-transform hover:scale-110 hover:bg-zinc-800/5"
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Texto de um comentário: nome (com selo e cor própria quando é o noivo ou a noiva) e o comentário. */
/** Posts na tela ou perto dela (até 40): só eles precisam de curtidas/comentários atualizados agora. */
function idsNearScreen(loaded: MuralPostView[]) {
  const margin = 1500;
  const near = Array.from(document.querySelectorAll<HTMLElement>("article[data-post-id]"))
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > -margin && rect.top < window.innerHeight + margin;
    })
    .map((element) => element.dataset.postId as string)
    .slice(0, 40);
  return near.length ? near : loaded.slice(0, 20).map((post) => post.id);
}

/** Junta posts novos aos que já estão na lista (sem repetir), mais novos primeiro. */
function mergeNewPosts(fresh: MuralPostView[], current: MuralPostView[]) {
  const known = new Set(current.map((post) => post.id));
  const extra = fresh.filter((post) => !known.has(post.id));
  return [...extra, ...current].sort((a, b) => Number(b.id) - Number(a.id));
}

/** Mais curtidos primeiro; empate: na ordem em que foram escritos (igual ao servidor). */
function sortComments(list: MuralCommentView[]) {
  return [...list].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** Curtir comentário: buquê pequeno ao lado do comentário, com o número de curtidas embaixo. */
function CommentLikeButton({ comment, disabled, onToggle }: { comment: MuralCommentView; disabled: boolean; onToggle: () => void }) {
  const [pop, setPop] = useState(0);
  const likes = comment.likes ?? 0;
  return (
    <button
      type="button"
      onClick={() => {
        if (!comment.likedByMe) setPop((count) => count + 1);
        onToggle();
      }}
      disabled={disabled}
      aria-pressed={Boolean(comment.likedByMe)}
      aria-label={`${comment.likedByMe ? 'Descurtir' : 'Curtir'} o comentário de ${comment.authorName}${likes ? ` (${likes} curtida${likes === 1 ? '' : 's'})` : ''}`}
      className="-mr-1 flex w-8 shrink-0 flex-col items-center gap-0.5 self-start pt-0.5 text-zinc-500 transition-colors hover:text-[#9e4f63] disabled:opacity-50"
    >
      <motion.span
        key={pop}
        className="block"
        initial={false}
        animate={pop > 0 ? { scale: [1, 0.7, 1.35, 0.9, 1] } : { scale: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        <BouquetIcon filled={Boolean(comment.likedByMe)} className="h-5 w-5" />
      </motion.span>
      {likes > 0 ? <span className="text-[0.65rem] font-medium leading-none tabular-nums">{likes}</span> : null}
    </button>
  );
}

function CommentText({ comment }: { comment: MuralCommentView }) {
  // Cores das molduras: rosé escuro (noiva) e verde-oliva escuro (noivo).
  const color = comment.authorRole === 'noiva' ? 'text-[#9e4f63]' : comment.authorRole === 'noivo' ? 'text-[#4b5b33]' : 'text-zinc-800';
  return (
    <p className={`break-words ${color}`}>
      <span className="font-semibold">{comment.authorName}</span>
      {comment.authorRole ? (
        <span className="mx-1.5 inline-block align-[1px]">
          <RoleBadge role={comment.authorRole} />
        </span>
      ) : null}{' '}
      <span className={comment.authorRole ? 'font-medium' : ''}>{comment.text}</span>
    </p>
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

/** Formato da mídia no card, como o Instagram: entre retrato 4:5 e paisagem 1,91:1 (a mesma regra do editor). */
function mediaAspect(post: MuralPostView) {
  if (!post.width || !post.height) return 4 / 5;
  return muralCardRatio(post.width, post.height);
}

/** Posição de cada foto do carrossel no card: a parte escolhida no editor, no sentido em que o card corta. */
function slidePosition(item: MuralMediaItemView) {
  const focus = Math.round(Math.min(1, Math.max(0, item.cardFocus ?? 0.5)) * 1000) / 10;
  return `${focus}% ${focus}%`;
}

/** Bolinhas do carrossel (como no Instagram): a atual em destaque; com muitas fotos, as das pontas diminuem. */
function CarouselDots({ count, index, tone = 'dark' }: { count: number; index: number; tone?: 'dark' | 'light' }) {
  if (count < 2) return null;
  return (
    <div className="flex items-center justify-center gap-1" aria-hidden="true">
      {Array.from({ length: count }, (_, dot) => {
        const distance = Math.abs(dot - index);
        const size = distance === 0 ? 'h-1.5 w-1.5' : distance <= 2 ? 'h-1.5 w-1.5' : 'h-1 w-1';
        return (
          <span
            key={dot}
            className={`rounded-full transition-all duration-300 ${size} ${
              dot === index ? (tone === 'dark' ? 'bg-champagne-600' : 'bg-white') : tone === 'dark' ? 'bg-zinc-800/20' : 'bg-white/45'
            }`}
          />
        );
      })}
    </div>
  );
}

/** Foto do carrossel que estava na tela no card quando o post foi aberto (o post grande abre nela). */
const openSlideHint: { postId: string | null; index: number } = { postId: null, index: 0 };

/** Fotos/vídeos de um post com várias mídias, no card: arrastar para os lados (ou setas no computador). */
function CardCarousel({
  items,
  index,
  onIndex,
  isMuted,
  onToggleMute,
  alt,
}: {
  items: MuralMediaItemView[];
  index: number;
  onIndex: (index: number) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  alt: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [inView, setInView] = useState(false);

  // Só o vídeo da foto atual toca (sem som), e só enquanto o card está na tela.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= 0.6), { threshold: [0, 0.6, 1] });
    observer.observe(track);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    videoRefs.current.forEach((video, videoIndex) => {
      if (!video) return;
      if (videoIndex === index && inView) void video.play().catch(() => undefined);
      else video.pause();
    });
  }, [index, inView]);

  const goTo = (next: number) => {
    const track = trackRef.current;
    if (!track) return;
    const target = Math.max(0, Math.min(items.length - 1, next));
    track.scrollTo({ left: target * track.clientWidth, behavior: 'smooth' });
  };

  const arrow =
    'absolute top-1/2 z-10 hidden h-[26px] w-[26px] -translate-y-1/2 items-center justify-center rounded-full bg-white/70 text-zinc-700 opacity-80 shadow-[0_1px_4px_rgba(0,0,0,0.18)] backdrop-blur-sm transition-opacity hover:opacity-100 sm:flex';
  const active = items[index];

  return (
    <>
      <div
        ref={trackRef}
        onScroll={(event) => {
          const track = event.currentTarget;
          const next = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
          if (next !== index) onIndex(next);
        }}
        className="absolute inset-0 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, itemIndex) => (
          <div key={itemIndex} className="relative h-full w-full shrink-0 snap-center snap-always">
            {item.mediaType === 'video' ? (
              <video
                ref={(element) => {
                  videoRefs.current[itemIndex] = element;
                }}
                src={item.fullUrl}
                poster={item.posterUrl ?? undefined}
                muted={isMuted}
                loop
                playsInline
                preload="metadata"
                className="absolute inset-0 h-full w-full object-cover"
                style={{ objectPosition: slidePosition(item) }}
              />
            ) : (
              <img
                src={item.fullUrl}
                alt={`${alt} (${itemIndex + 1} de ${items.length})`}
                loading={itemIndex === 0 ? 'eager' : 'lazy'}
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ objectPosition: slidePosition(item) }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Contador "2/5" no canto, como no Instagram. */}
      <span className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium tabular-nums text-white">
        {index + 1}/{items.length}
      </span>
      {index > 0 ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            goTo(index - 1);
          }}
          aria-label="Foto anterior"
          className={`${arrow} left-3`}
        >
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : null}
      {index < items.length - 1 ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            goTo(index + 1);
          }}
          aria-label="Próxima foto"
          className={`${arrow} right-3`}
        >
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
            <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : null}
      {active?.mediaType === 'video' ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleMute();
          }}
          aria-label={isMuted ? 'Ativar som' : 'Desativar som'}
          className="absolute bottom-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M11 5 6 9H3v6h3l5 4V5Z" fill="currentColor" />
            {isMuted ? <path d="m16 9 5 6m0-6-5 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />}
          </svg>
        </button>
      ) : null}
    </>
  );
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
  // Post com várias fotos/vídeos: carrossel (e qual delas está na tela).
  const carouselItems = post.media && post.media.length > 1 ? post.media : null;
  const [slide, setSlide] = useState(0);

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
        openSlideHint.postId = post.id;
        openSlideHint.index = slide;
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
      openSlideHint.postId = post.id;
      openSlideHint.index = slide;
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
      title: carouselItems ? 'Apagar post?' : post.mediaType === 'video' ? 'Apagar vídeo?' : 'Apagar foto?',
      message: `O post sai do mural junto com as curtidas e os comentários. Você ainda tem ${formatCountdown(deleteRemaining)} para apagar; depois, só os noivos.`,
      confirmLabel: 'Apagar',
      onConfirm: deletePost,
    });

  const caption = post.caption ?? '';
  const longCaption = caption.length > 120;

  return (
    <article
      ref={cardRef}
      data-post-id={post.id}
      className={`-mx-4 overflow-hidden border-b pb-6 sm:mx-0 sm:rounded-[1.5rem] sm:border sm:pb-4 safari-clip ${
        // Fundo do card: rosado no post da noiva, marfim esverdeado no do noivo, creme nos dos convidados.
        post.authorRole === 'noiva'
          ? 'border-[#ecc9c1] bg-[#fcefec] sm:shadow-[0_18px_40px_rgba(170,90,95,0.14)]'
          : post.authorRole === 'noivo'
            ? 'border-[#ddd6b2] bg-[#f4f3e4] sm:shadow-[0_18px_40px_rgba(75,91,51,0.14)]'
            : 'border-zinc-800/10 sm:bg-[#fffaf1] sm:shadow-[0_18px_40px_rgba(47,36,27,0.06)]'
      }`}
    >
      <header className="flex items-center gap-3 px-4 py-3">
        <Avatar name={post.authorName} role={post.authorRole} />
        <div className="min-w-0 flex-1">
          <AuthorName name={post.authorName} role={post.authorRole} />
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

      {/* Post do noivo/noiva: faixas da moldura acima e abaixo da foto (CoupleFrame); dos convidados, passa direto. */}
      <CoupleFrame role={post.authorRole}>
      <div
        className="safari-clip relative w-full cursor-pointer select-none overflow-hidden bg-[#f1e7d3] sm:rounded-none"
        style={{ aspectRatio: String(mediaAspect(post)) }}
        onClick={handleMediaTap}
      >
        {carouselItems ? (
          <CardCarousel
            items={carouselItems}
            index={slide}
            onIndex={setSlide}
            isMuted={isMuted}
            onToggleMute={() => setIsMuted((muted) => !muted)}
            alt={caption || `Foto de ${post.authorName}`}
          />
        ) : post.mediaType === 'video' ? (
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
              style={{ objectPosition: muralObjectPosition(post.width, post.height, post.cardFocus) }}
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
          <img
            src={post.fullUrl}
            alt={caption || `Foto de ${post.authorName}`}
            loading="lazy"
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
            // Parte da foto escolhida no editor (o card corta fotos muito altas ou muito largas).
            style={{ objectPosition: muralObjectPosition(post.width, post.height, post.cardFocus) }}
          />
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
      </CoupleFrame>

      <div className="px-4 pt-3">
        <div className="relative flex items-center gap-3">
          {carouselItems ? (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2">
              <CarouselDots count={carouselItems.length} index={slide} />
            </div>
          ) : null}
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
  const listEnd = useRef<HTMLDivElement>(null);
  const likeBusy = useRef(0);
  useLockScroll(true);
  // Carrossel: qual foto/vídeo do post está aberta (volta para a 1ª ao trocar de post).
  const slides = post.media && post.media.length > 1 ? post.media : null;
  const startSlide = () => {
    const index = openSlideHint.postId === post.id ? openSlideHint.index : 0;
    openSlideHint.postId = null;
    return Math.max(0, Math.min(index, (post.media?.length ?? 1) - 1));
  };
  const [slide, setSlide] = useState(startSlide);
  const firstPositioned = useRef(false);
  // Trocou de post: a foto inicial é definida já nesta renderização (antes de o trilho novo aparecer).
  const [slideFor, setSlideFor] = useState(post.id);
  if (slideFor !== post.id) {
    setSlideFor(post.id);
    setSlide(startSlide());
    firstPositioned.current = false;
  }
  const canSlideBack = Boolean(slides) && slide > 0;
  const canSlideForward = Boolean(slides) && slide < (slides?.length ?? 1) - 1;
  // Trilho do carrossel (acompanha o dedo, com encaixe em cada foto).
  const trackRef = useRef<HTMLDivElement>(null);
  const slideVideos = useRef<(HTMLVideoElement | null)[]>([]);
  // Setas/teclado mudam a foto: o trilho desliza até ela (o arrastar já move o trilho sozinho).
  useEffect(() => {
    // A janela abre num portal: o trilho pode ainda não ter largura no 1º instante; tenta nos quadros seguintes.
    let frame = 0;
    let tries = 0;
    const place = () => {
      const track = trackRef.current;
      if (!track || !track.clientWidth) {
        if (tries++ < 60) frame = window.requestAnimationFrame(place);
        return;
      }
      // Ao abrir, já aparece na foto certa (sem animação); depois, desliza.
      const behavior = firstPositioned.current ? 'smooth' : 'auto';
      firstPositioned.current = true;
      if (Math.round(track.scrollLeft / track.clientWidth) !== slide) track.scrollTo({ left: slide * track.clientWidth, behavior });
    };
    place();
    return () => window.cancelAnimationFrame(frame);
  }, [slide, post.id]);
  // Só o vídeo da foto atual toca.
  useEffect(() => {
    slideVideos.current.forEach((video, index) => {
      if (!video) return;
      if (index === slide) void video.play().catch(() => undefined);
      else video.pause();
    });
  }, [slide, post.id]);
  // No celular, a área da foto tem a altura da 1ª foto (como no Instagram), sem passar de 70% da tela.
  const firstSlide = slides?.[0];
  const slideRatio = firstSlide?.width && firstSlide?.height ? firstSlide.width / firstSlide.height : 4 / 5;

  useEffect(() => {
    let cancelled = false;
    setComments(null);
    setError('');
    // Comentários (e curtidas deles) ao vivo enquanto o post está aberto.
    const load = (first: boolean) =>
      fetch(`/api/mural/comments?postId=${post.id}&viewerId=${encodeURIComponent(viewerId)}`, { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((data) => {
          if (!cancelled && Array.isArray(data?.comments) && likeBusy.current === 0) setComments(data.comments);
        })
        .catch(() => !cancelled && first && setComments([]));
    void load(true);
    const timer = window.setInterval(() => document.visibilityState === 'visible' && void load(false), COMMENTS_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [post.id, viewerId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLInputElement;
      if (event.key === 'Escape') onClose();
      if (typing) return;
      // Setas: primeiro passam as fotos do carrossel; nas pontas, passam de post.
      if (event.key === 'ArrowLeft') {
        if (canSlideBack) setSlide((value) => value - 1);
        else if (hasPrevious) onPrevious();
      }
      if (event.key === 'ArrowRight') {
        if (canSlideForward) setSlide((value) => value + 1);
        else if (hasNext) onNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasNext, hasPrevious, onClose, onNext, onPrevious, canSlideBack, canSlideForward]);

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

  // Curtir comentário: atualiza na hora (e já reordena); o servidor devolve a lista oficial.
  const likeComment = async (comment: MuralCommentView) => {
    if (!canInteract) return;
    likeBusy.current += 1;
    const next = !comment.likedByMe;
    setComments((list) =>
      list ? sortComments(list.map((item) => (item.id === comment.id ? { ...item, likedByMe: next, likes: Math.max(0, (item.likes ?? 0) + (next ? 1 : -1)) } : item))) : list
    );
    try {
      const response = await fetch('/api/mural/comments/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewerId, commentId: comment.id, like: next }),
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data?.comments)) throw new Error(data?.error);
      setComments(data.comments);
    } catch {
      setComments((list) => (list ? sortComments(list.map((item) => (item.id === comment.id ? comment : item))) : list));
    } finally {
      likeBusy.current -= 1;
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

  const arrowClass = 'absolute top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-2xl leading-none text-zinc-800 shadow-lg transition-transform hover:scale-105 sm:flex [@media(hover:none)]:!hidden';

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
            // Celular: arrastar para os lados só passa as fotos do carrossel (não troca de post).
          >
            {slides ? (
              <>
                <div
                  key={post.id}
                  ref={trackRef}
                  onScroll={(event) => {
                    const track = event.currentTarget;
                    const next = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
                    if (next !== slide) setSlide(next);
                  }}
                  className="flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] sm:!h-full [&::-webkit-scrollbar]:hidden"
                  // O trilho é quem rola para os lados (acompanha o dedo); a página continua rolando para cima/baixo.
                  style={{ height: `min(70svh, calc(100vw / ${slideRatio}))`, touchAction: 'pan-x pan-y pinch-zoom' }}
                >
                  {slides.map((item, index) => (
                    <div key={index} className="flex h-full w-full shrink-0 snap-center snap-always items-center justify-center">
                      {item.mediaType === 'video' ? (
                        <video
                          ref={(element) => {
                            slideVideos.current[index] = element;
                          }}
                          src={item.fullUrl}
                          poster={item.posterUrl ?? undefined}
                          controls
                          playsInline
                          preload="metadata"
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <img
                          src={item.fullUrl}
                          alt={`${post.caption ?? `Foto de ${post.authorName}`} (${index + 1} de ${slides.length})`}
                          onClick={handlePhotoTap}
                          loading={index <= 1 ? 'eager' : 'lazy'}
                          draggable={false}
                          className="h-full w-full object-contain"
                        />
                      )}
                    </div>
                  ))}
                </div>
                <span className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium tabular-nums text-white">
                  {slide + 1}/{slides.length}
                </span>
                {canSlideBack ? (
                  <button
                    type="button"
                    onClick={() => setSlide((value) => value - 1)}
                    aria-label="Foto anterior"
                    className="absolute left-3 top-1/2 z-10 hidden h-[26px] w-[26px] -translate-y-1/2 items-center justify-center rounded-full bg-white/70 text-zinc-700 opacity-80 shadow-[0_1px_4px_rgba(0,0,0,0.18)] backdrop-blur-sm transition-opacity hover:opacity-100 sm:flex"
                  >
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                      <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                ) : null}
                {canSlideForward ? (
                  <button
                    type="button"
                    onClick={() => setSlide((value) => value + 1)}
                    aria-label="Próxima foto"
                    className="absolute right-3 top-1/2 z-10 hidden h-[26px] w-[26px] -translate-y-1/2 items-center justify-center rounded-full bg-white/70 text-zinc-700 opacity-80 shadow-[0_1px_4px_rgba(0,0,0,0.18)] backdrop-blur-sm transition-opacity hover:opacity-100 sm:flex"
                  >
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                ) : null}
                <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10">
                  <CarouselDots count={slides.length} index={slide} tone="light" />
                </div>
              </>
            ) : post.mediaType === 'video' ? (
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

          {/* Lado das informações: mesmo fundo do card (rosado da noiva, marfim esverdeado do noivo, creme dos convidados). */}
          <div
            className={`flex flex-1 flex-col sm:w-[min(400px,38%)] sm:flex-none sm:min-h-0 ${
              post.authorRole === 'noiva' ? 'bg-[#fcefec]' : post.authorRole === 'noivo' ? 'bg-[#f4f3e4]' : ''
            }`}
          >
            <div className="flex items-center gap-3 border-b border-zinc-800/10 px-4 py-3">
              <Avatar name={post.authorName} role={post.authorRole} />
              <div className="min-w-0 flex-1">
                <AuthorName name={post.authorName} role={post.authorRole} />
                <p className="text-xs text-zinc-500">{timeAgo(post.createdAt)}</p>
              </div>
            </div>

            <div className="flex-1 space-y-4 px-4 py-4 text-sm sm:min-h-0 sm:overflow-y-auto">
              {post.caption ? (
                <div className="flex gap-3">
                  <Avatar name={post.authorName} size="h-8 w-8" role={post.authorRole} />
                  <p className="min-w-0 flex-1 whitespace-pre-line break-words text-zinc-800">
                    <span className="font-semibold">{post.authorName}</span> {post.caption}
                  </p>
                </div>
              ) : null}
              {comments === null ? <p className="text-zinc-500">Carregando comentários…</p> : null}
              {comments?.length === 0 && !post.caption ? <p className="py-6 text-center text-zinc-500">Nenhum comentário ainda.</p> : null}
              {comments?.map((comment) => (
                // layout: ao mudar a ordem (mais curtidos em cima), o comentário desliza até o novo lugar.
                <motion.div key={comment.id} layout transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="flex gap-3">
                  <Avatar name={comment.authorName} size="h-8 w-8" role={comment.authorRole} />
                  <div className="min-w-0 flex-1">
                    <CommentText comment={comment} />
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {timeAgo(comment.createdAt)}
                      {comment.isMine ? <DeleteCommentLink secondsLeft={comment.deleteSecondsLeft} onClick={(remaining) => askDeleteComment(comment.id, remaining)} /> : null}
                    </p>
                  </div>
                  <CommentLikeButton comment={comment} disabled={!canInteract} onToggle={() => likeComment(comment)} />
                </motion.div>
              ))}
              <div ref={listEnd} />
            </div>

            {/* Curtir e comentar: no celular fica preso no rodapé da tela (não precisa rolar até o fim para comentar). */}
            <div
              className={`sticky bottom-0 z-10 border-t border-zinc-800/10 px-4 pt-3 shadow-[0_-8px_20px_rgba(47,36,27,0.06)] sm:static sm:shadow-none ${
                post.authorRole === 'noiva' ? 'bg-[#fcefec]' : post.authorRole === 'noivo' ? 'bg-[#f4f3e4]' : 'bg-[#fffaf1]'
              }`}
              style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
            >
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
                  <CommentInput id="mural-modal-comment" value={text} onChange={setText} />
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
  const likeBusy = useRef(0);
  useLockScroll(true);

  useEffect(() => {
    let cancelled = false;
    // Comentários (e curtidas deles) ao vivo enquanto a janela está aberta.
    const load = (first: boolean) =>
      fetch(`/api/mural/comments?postId=${post.id}&viewerId=${encodeURIComponent(viewerId)}`, { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((data) => {
          if (!cancelled && Array.isArray(data?.comments) && likeBusy.current === 0) setComments(data.comments);
        })
        .catch(() => !cancelled && first && setComments([]));
    void load(true);
    const timer = window.setInterval(() => document.visibilityState === 'visible' && void load(false), COMMENTS_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
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

  // Curtir comentário: atualiza na hora (e já reordena); o servidor devolve a lista oficial.
  const likeComment = async (comment: MuralCommentView) => {
    if (!canInteract) return;
    likeBusy.current += 1;
    const next = !comment.likedByMe;
    setComments((list) =>
      list ? sortComments(list.map((item) => (item.id === comment.id ? { ...item, likedByMe: next, likes: Math.max(0, (item.likes ?? 0) + (next ? 1 : -1)) } : item))) : list
    );
    try {
      const response = await fetch('/api/mural/comments/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewerId, commentId: comment.id, like: next }),
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data?.comments)) throw new Error(data?.error);
      setComments(data.comments);
    } catch {
      setComments((list) => (list ? sortComments(list.map((item) => (item.id === comment.id ? comment : item))) : list));
    } finally {
      likeBusy.current -= 1;
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

          <div className="min-h-[8rem] flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 text-sm">
            {post.caption ? (
              <div className="flex gap-3 border-b border-zinc-800/10 pb-4">
                <Avatar name={post.authorName} size="h-8 w-8" role={post.authorRole} />
                <p className="min-w-0 flex-1 break-words text-zinc-800">
                  <span className="font-semibold">{post.authorName}</span> {post.caption}
                </p>
              </div>
            ) : null}
            {comments === null ? <p className="text-zinc-500">Carregando comentários…</p> : null}
            {comments?.length === 0 ? <p className="py-6 text-center text-zinc-500">Nenhum comentário ainda. Seja o primeiro!</p> : null}
            {comments?.map((comment) => (
              // layout: ao mudar a ordem (mais curtidos em cima), o comentário desliza até o novo lugar.
              <motion.div key={comment.id} layout transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="flex gap-3">
                <Avatar name={comment.authorName} size="h-8 w-8" role={comment.authorRole} />
                <div className="min-w-0 flex-1">
                  <CommentText comment={comment} />
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {timeAgo(comment.createdAt)}
                    {comment.isMine ? <DeleteCommentLink secondsLeft={comment.deleteSecondsLeft} onClick={(remaining) => askDeleteComment(comment.id, remaining)} /> : null}
                  </p>
                </div>
                <CommentLikeButton comment={comment} disabled={!canInteract} onToggle={() => likeComment(comment)} />
              </motion.div>
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
              <CommentInput id="mural-comment" value={text} onChange={setText} />
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

type Picked = {
  file: File;
  kind: 'image' | 'video';
  previewUrl: string;
  duration: number | null;
  width: number | null;
  height: number | null;
  /** Foto como saiu da câmera/galeria (o editor sempre parte dela, para reeditar sem perder qualidade). */
  original: File;
  /** Último ajuste feito no editor (enquadramento e textos), para reabrir do ponto em que parou. */
  edit: PhotoEditState | null;
  /** Vídeo: recorte escolhido no editor (o Cloudinary aplica ao processar). */
  crop: VideoCrop | null;
};

/** Janela de postar: escolher/tirar foto ou vídeo, legenda e envio com progresso. Também usada no painel (aba Mural). */
export function Composer({
  viewerId,
  authorName,
  viewerAdmin,
  onAuthorName,
  onClose,
  onPosted,
}: {
  viewerId: string;
  authorName: string;
  viewerAdmin: MuralAdminView | null;
  onAuthorName: (name: string) => void;
  onClose: () => void;
  onPosted: () => void;
}) {
  // Fotos/vídeos do post (carrossel, até MAX_MEDIA_PER_POST) e qual delas está na prévia/edição.
  const [items, setItems] = useState<Picked[]>([]);
  const [current, setCurrent] = useState(0);
  const picked = items[current] ?? null;
  const itemsRef = useRef<Picked[]>([]);
  itemsRef.current = items;
  const currentRef = useRef(0);
  currentRef.current = current;
  /** Atualiza a mídia que está na tela (edição/recorte). */
  const setPicked = useCallback((update: (item: Picked | null) => Picked | null) => {
    setItems((list) => list.map((item, index) => (index === currentRef.current ? (update(item) ?? item) : item)));
  }, []);
  const [caption, setCaption] = useState('');
  const captionRef = useRef<HTMLTextAreaElement>(null);
  /** Emoji na legenda: entra onde está o cursor (sem passar do limite de 300 caracteres). */
  const insertCaptionEmoji = (emoji: string) => {
    const field = captionRef.current;
    const start = field?.selectionStart ?? caption.length;
    const end = field?.selectionEnd ?? caption.length;
    const next = caption.slice(0, start) + emoji + caption.slice(end);
    if (next.length > 300) return;
    setCaption(next);
    window.requestAnimationFrame(() => {
      if (!field) return;
      const caret = start + emoji.length;
      field.focus();
      field.setSelectionRange(caret, caret);
    });
  };
  // Mural aberto: quem publica só informa o nome (vem preenchido com o último usado neste aparelho).
  const [name, setName] = useState(viewerAdmin?.name ?? authorName);
  const [progress, setProgress] = useState<number | null>(null);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  // Abre direto na câmera (como no Instagram), se o aparelho tiver; senão, escolher arquivo.
  const [showCamera, setShowCamera] = useState(() => isCameraSupported());
  // Editor (como no Instagram): abre sozinho ao escolher a foto/vídeo e pode ser reaberto pelo botão "Editar".
  const [isEditing, setIsEditing] = useState(false);
  const isUploading = progress !== null;
  useLockScroll(true);

  // Libera as prévias ao fechar.
  useEffect(
    () => () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    },
    []
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isUploading && !isEditing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isUploading, isEditing, onClose]);

  const closeEditor = useCallback(() => setIsEditing(false), []);
  const editorUnsupported = useCallback(() => {
    setIsEditing(false);
    setError('Não deu para abrir o editor neste aparelho; o arquivo será publicado como está.');
  }, []);

  /** Foto editada: vira o arquivo a publicar (o original fica guardado para reeditar). */
  const applyPhotoEdit = useCallback((result: PhotoEditResult) => {
    setPicked((current) =>
      current
        ? {
            ...current,
            file: new File([result.blob], 'foto.jpg', { type: 'image/jpeg' }),
            previewUrl: URL.createObjectURL(result.blob),
            width: result.width,
            height: result.height,
            edit: result.state,
          }
        : current
    );
    setIsEditing(false);
  }, []);

  /** Vídeo recortado: guarda o recorte (o arquivo continua o mesmo; quem recorta é o Cloudinary). */
  const applyVideoCrop = useCallback((result: VideoCropResult) => {
    setPicked((current) =>
      current ? { ...current, previewUrl: URL.createObjectURL(current.original), crop: result.crop, width: result.width, height: result.height, edit: result.state } : current
    );
    setIsEditing(false);
  }, []);

  /** Acrescenta fotos/vídeos ao post (da galeria, várias de uma vez, ou da câmera). */
  const addFiles = async (files: File[]) => {
    setError('');
    if (!files.length) return;
    const room = MAX_MEDIA_PER_POST - itemsRef.current.length;
    if (room <= 0) {
      setShowCamera(false);
      setError(`No máximo ${MAX_MEDIA_PER_POST} fotos ou vídeos por post.`);
      return;
    }
    const accepted: Picked[] = [];
    let problem = '';
    for (const file of files.slice(0, room)) {
      const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name) ? 'image' : null;
      if (!kind) {
        problem = 'Escolha fotos ou vídeos.';
        continue;
      }
      if (kind === 'video' && file.size > MAX_VIDEO_BYTES) {
        problem = 'Vídeo muito grande (máximo 100 MB). Grave um vídeo mais curto ou corte antes de enviar.';
        continue;
      }
      const meta = kind === 'video' ? await readVideoMeta(file) : { duration: null, width: null, height: null };
      accepted.push({ file, kind, previewUrl: URL.createObjectURL(file), ...meta, original: file, edit: null, crop: null });
    }
    if (files.length > room) problem = `Cabem no máximo ${MAX_MEDIA_PER_POST} fotos ou vídeos por post; as demais ficaram de fora.`;
    setShowCamera(false);
    if (problem) setError(problem);
    if (!accepted.length) return;
    const start = itemsRef.current.length;
    setItems((list) => [...list, ...accepted].slice(0, MAX_MEDIA_PER_POST));
    setCurrent(start);
    // Uma foto só: abre o editor na hora (como antes); várias: cada uma pode ser editada pelo botão "Editar".
    if (accepted.length === 1) setIsEditing(true);
  };
  const pickFile = (file: File | undefined) => addFiles(file ? [file] : []);

  /** Mais fotos/vídeos no mesmo post: câmera (se tiver) ou galeria. */
  const addMore = () => {
    setError('');
    if (isCameraSupported()) setShowCamera(true);
    else inputRef.current?.click();
  };

  /** Tira a mídia da tela do post; se era a única, volta para escolher de novo (como o antigo "Refazer"). */
  const removeCurrent = () => {
    setError('');
    const removed = itemsRef.current[current];
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    const next = itemsRef.current.filter((_, index) => index !== current);
    setItems(next);
    setCurrent((value) => Math.max(0, Math.min(value, next.length - 1)));
    if (!next.length) addMore();
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
    // Noivo/noiva publicam direto, sem a confirmação (eles podem editar ou excluir o post no painel a qualquer hora).
    if (viewerAdmin) {
      void publish();
      return;
    }
    setConfirmRequest({
      title: items.length > 1 ? `Publicar estas ${items.length} fotos e vídeos?` : picked.kind === 'video' ? 'Publicar este vídeo?' : 'Publicar esta foto?',
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
      // Envia cada foto/vídeo ao Cloudinary, uma de cada vez (a barra mostra o total).
      const total = items.length;
      const uploaded: Record<string, unknown>[] = [];
      for (let index = 0; index < total; index += 1) {
        const item = items[index];
        const label = total > 1 ? ` (${index + 1} de ${total})` : '';
        let upload: Blob = item.file;
        let width = item.width;
        let height = item.height;
        if (item.kind === 'image') {
          setStage(`Preparando a foto${label}…`);
          const compressed = await compressImage(item.file);
          upload = compressed.blob;
          width = compressed.width ?? width;
          height = compressed.height ?? height;
          if (upload.size > MAX_IMAGE_BYTES) throw new Error(`Foto muito grande (máximo 10 MB)${label}.`);
        }

        setStage(`Enviando${label}…`);
        const signResponse = await fetch('/api/mural/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ viewerId, name: trimmedName, kind: item.kind, crop: item.crop ?? undefined }),
        });
        const sign = await signResponse.json();
        if (!signResponse.ok) throw new Error(sign?.error || 'Não foi possível preparar o envio.');

        const fileName = item.kind === 'image' && upload !== item.file ? 'foto.jpg' : item.file.name || 'arquivo';
        const done = index;
        const result = await uploadToCloudinary(upload, fileName, sign, (fraction) => setProgress((done + fraction) / total));
        uploaded.push({
          publicId: result.public_id,
          version: result.version,
          signature: result.signature,
          resourceType: result.resource_type,
          // Vídeo recortado: o tamanho que vale é o do recorte (o Cloudinary devolve o do arquivo original).
          width: item.crop ? width : (result.width ?? width),
          height: item.crop ? height : (result.height ?? height),
          duration: result.duration ?? item.duration,
          crop: item.crop ?? undefined,
          // Parte da foto/vídeo que aparece no card (escolhida no editor).
          focus: item.edit?.muralFocus ?? 0.5,
        });
      }
      const [first, ...extra] = uploaded;

      setStage('Publicando…');
      const response = await fetch('/api/mural/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viewerId,
          name: trimmedName,
          // Se a pessoa também entrou com o código do convite, o post fica ligado a ele (só referência).
          code: readStoredCode() || undefined,
          ...first,
          // Carrossel: as demais fotos/vídeos, na ordem.
          extra,
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
          className="flex max-h-[92svh] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] bg-[#fffaf1] shadow-2xl sm:rounded-[2rem]"
        >
          {/* Conteúdo que rola; o rodapé com os botões fica fora dele (nada fica escondido atrás dos botões). */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 pb-6 sm:p-8 sm:pb-7">
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
            multiple
            className="hidden"
            onChange={(event) => {
              void addFiles(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
          {showCamera ? (
            <CameraCapture
              onCapture={(file) => pickFile(file)}
              onGallery={() => inputRef.current?.click()}
              // Fechar a câmera ao acrescentar mais fotos volta para o post; sem nenhuma foto, fecha a janela.
              onClose={() => (itemsRef.current.length ? setShowCamera(false) : onClose())}
            />
          ) : null}

          {picked ? (
            <>
            <div className="safari-clip relative mt-6 overflow-hidden rounded-2xl bg-black">
              {items.length > 1 ? (
                <span className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium tabular-nums text-white">
                  {current + 1}/{items.length}
                </span>
              ) : null}
              {picked.kind === 'video' ? (
                picked.crop ? (
                  // Prévia do recorte: o vídeo inteiro ampliado e deslocado dentro de uma janela do tamanho do recorte.
                  <div
                    className="relative mx-auto overflow-hidden"
                    style={{
                      aspectRatio: `${picked.width ?? 1} / ${picked.height ?? 1}`,
                      // Cabe na largura e em no máximo 45% da altura da tela, sem distorcer.
                      width: `min(100%, calc(min(31svh, 330px) * ${(picked.width ?? 1) / (picked.height ?? 1)}))`,
                    }}
                  >
                    <video
                      src={picked.previewUrl}
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="absolute max-w-none object-fill"
                      style={{
                        width: `${100 / picked.crop.w}%`,
                        height: `${100 / picked.crop.h}%`,
                        left: `${(-picked.crop.x / picked.crop.w) * 100}%`,
                        top: `${(-picked.crop.y / picked.crop.h) * 100}%`,
                      }}
                    />
                  </div>
                ) : (
                  <video src={picked.previewUrl} controls playsInline className="max-h-[min(31svh,330px)] w-full" />
                )
              ) : (
                // Prévia como o card do mural: no formato do card (4:5 a 1,91:1), cortando pelo centro igual ao mural.
                <div
                  className="relative mx-auto overflow-hidden"
                  style={{
                    aspectRatio: String(picked.width && picked.height ? muralCardRatio(picked.width, picked.height) : 4 / 5),
                    width: `min(100%, calc(min(31svh, 330px) * ${picked.width && picked.height ? muralCardRatio(picked.width, picked.height) : 4 / 5}))`,
                  }}
                >
                  <img
                    src={picked.previewUrl}
                    alt="Pré-visualização"
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ objectPosition: muralObjectPosition(picked.width, picked.height, picked.edit?.muralFocus) }}
                  />
                  <span className="pointer-events-none absolute left-2 top-2 whitespace-nowrap rounded-full bg-black/55 px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.1em] text-white/90 backdrop-blur-sm sm:left-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-[0.65rem] sm:tracking-[0.12em]">
                    Como fica no mural
                  </span>
                </div>
              )}
              {!isUploading ? (
                <div className="absolute bottom-3 right-3 flex gap-2">
                  <button type="button" onClick={() => setIsEditing(true)} className="rounded-full bg-white/90 px-4 py-2 text-xs font-medium text-zinc-800 shadow">
                    {picked.kind === 'video' ? 'Recortar' : 'Editar'}
                  </button>
                  <button type="button" onClick={removeCurrent} className="rounded-full bg-white/90 px-4 py-2 text-xs font-medium text-zinc-800 shadow">
                    {items.length > 1 ? 'Remover' : 'Refazer'}
                  </button>
                </div>
              ) : null}
            </div>
            {/* Carrossel: miniaturas na ordem do post (tocar escolhe qual editar) e "+" para acrescentar mais. */}
            <div className="-mx-1 mt-2 flex items-center gap-2 overflow-x-auto px-1 pb-1.5 pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {items.map((item, index) => (
                <button
                  key={item.previewUrl}
                  type="button"
                  onClick={() => setCurrent(index)}
                  disabled={isUploading}
                  aria-label={`${item.kind === 'video' ? 'Vídeo' : 'Foto'} ${index + 1} de ${items.length}`}
                  aria-pressed={index === current}
                  className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-black transition-all ${
                    index === current ? 'ring-2 ring-champagne-600 ring-offset-2 ring-offset-[#fffaf1]' : 'opacity-75 hover:opacity-100'
                  }`}
                >
                  {item.kind === 'video' ? (
                    <>
                      <video src={item.previewUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                      <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[0.55rem] text-white">▶</span>
                    </>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                  )}
                  <span className="absolute left-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-black/60 px-1 text-[0.6rem] font-semibold text-white">
                    {index + 1}
                  </span>
                </button>
              ))}
              {items.length < MAX_MEDIA_PER_POST && !isUploading ? (
                <button
                  type="button"
                  onClick={addMore}
                  aria-label="Acrescentar fotos ou vídeos"
                  className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-zinc-800/20 text-champagne-700 transition-colors hover:border-champagne-600/60 hover:bg-champagne-600/5"
                >
                  <span className="text-2xl leading-none">+</span>
                  <span className="text-[0.6rem] font-medium">{items.length}/{MAX_MEDIA_PER_POST}</span>
                </button>
              ) : null}
            </div>
            {items.length === 1 ? (
              <p className="mt-1 text-xs text-zinc-500">Toque no + para colocar mais fotos ou vídeos neste post (carrossel).</p>
            ) : null}
            </>
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

          {viewerAdmin ? (
            // Noivo/noiva logados no painel: o nome vem do login e o post sai em destaque.
            <div className="mt-5 flex items-center gap-2 rounded-2xl border border-[#d6b46e] bg-[#fdf5e3] px-4 py-3 text-sm text-zinc-700">
              <span>
                Publicando como <strong className="text-zinc-800">{viewerAdmin.name}</strong>
              </span>
              <RoleBadge role={viewerAdmin.role} />
            </div>
          ) : (
            <>
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
            </>
          )}

          <label htmlFor="composer-caption" className={`${EYEBROW} mt-5 block`}>
            Legenda <span className="normal-case tracking-normal text-zinc-500">(opcional)</span>
          </label>
          <div className="relative mt-2">
            <textarea
              ref={captionRef}
              id="composer-caption"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              maxLength={300}
              rows={2}
              disabled={isUploading}
              placeholder="Escreva algo sobre este momento…"
              className={`${FIELD} resize-none pr-14`}
            />
            <div className="absolute bottom-2.5 right-2.5">
              <EmojiPicker onSelect={insertCaptionEmoji} disabled={isUploading} />
            </div>
          </div>

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

          </div>
          {/* Rodapé com os botões: sempre à vista, mesmo com muita coisa para rolar. */}
          <div
            className="flex shrink-0 gap-2 border-t border-zinc-800/10 bg-[#fffaf1] px-6 pt-3 sm:justify-end sm:px-8"
            style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <button type="button" onClick={onClose} disabled={isUploading} className={`${SECONDARY} flex-1 !py-2.5 sm:flex-none`}>
              Cancelar
            </button>
            <button type="button" onClick={askPublish} disabled={!picked || isUploading} className={`${PRIMARY} flex-1 !py-2.5 sm:flex-none`}>
              {isUploading ? 'Publicando…' : 'Publicar'}
            </button>
          </div>
        </motion.div>
      </motion.div>
      <ConfirmPopup request={confirmRequest} onClose={closeConfirm} />
      {picked && isEditing ? (
        <PhotoEditor
          key={picked.original.name + picked.original.size}
          file={picked.original}
          kind={picked.kind}
          initialState={picked.edit ?? undefined}
          onCancel={closeEditor}
          onDone={applyPhotoEdit}
          onCropDone={applyVideoCrop}
          onUnsupported={editorUnsupported}
        />
      ) : null}
    </Portal>
  );
}
