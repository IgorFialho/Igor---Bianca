"use client";

import { useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type CSSProperties, type PointerEvent } from 'react';

const INTRO_TEXT = 'bem-vindos à nossa história de amor...';
const ENTER_LABEL = 'Clique para entrar';

// Imagens de TESTE (arte da Cordially). Troque por imagens próprias antes de publicar:
// o fundo precisa ter o buraco do arco transparente, e as flores, fundo transparente.
const BACKGROUND_SRC = '/intro/arco/fundo.webp';
const LEFT_PANEL_SRC = '/intro/arco/flores-esquerda.webp';
const RIGHT_PANEL_SRC = '/intro/arco/flores-direita.webp';

const ENTER_DURATION_MS = 1700;
const REDUCED_MOTION_DURATION_MS = 300;
// Se as imagens demorarem, abre mesmo assim depois desse tempo.
const LOAD_TIMEOUT_MS = 4000;

const ENTER_EASING = 'cubic-bezier(0.74, 0, 0.16, 1)';
const OPEN_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

// Proporção das imagens de flores (1891x810).
const PANEL_RATIO = 1891 / 810;
const PANEL_OFFSET = `max(50vw, ${50 * PANEL_RATIO}svh)`;

// Disparado no clique de "Clique para entrar"; o player de música escuta para começar a tocar.
export const INTRO_ENTER_EVENT = 'intro:enter';

type Phase = 'closed' | 'open' | 'entering' | 'done';
type Layer = 'background' | 'left' | 'right';
type Parallax = { x: number; y: number };

// As camadas são enormes e reduzidas com scale(); ao entrar, o scale cresce e a "câmera"
// atravessa o arco. Cada camada se move numa intensidade diferente com o mouse (profundidade).
function layerTransform(layer: Layer, phase: Phase, { x, y }: Parallax) {
  const entering = phase === 'entering';

  if (layer === 'background') {
    if (phase === 'closed') return `translate3d(-50%, -50%, 0) scale(${1 / 12})`;
    const dx = entering ? 0 : 20 * x - 4 * y;
    const dy = entering ? 0 : 15 * y + 3 * x;
    return `translate3d(calc(-50% + ${dx}px), calc(-50% + ${dy}px), 0) scale(${entering ? 1 : 1.04 / 12})`;
  }

  if (phase === 'closed') return `translate3d(-50%, -50%, 0) scale(${1 / 3})`;

  const sign = layer === 'left' ? '-' : '+';
  const offset = entering ? `calc(52vw + 2.15 * ${PANEL_OFFSET})` : `calc(5vw + ${PANEL_OFFSET})`;
  const dx = entering ? 0 : layer === 'left' ? 48 * x + 7 * y : 54 * x - 9 * y;
  const dy = entering ? 0 : layer === 'left' ? 27 * y - 5 * x : 22 * y + 6 * x;
  return `translate3d(calc(-50% ${sign} ${offset} + ${dx}px), calc(-50% + ${dy}px), 0) scale(${entering ? 2.15 / 3 : 1.03 / 3})`;
}

function layerStyle(layer: Layer, phase: Phase, parallax: Parallax): CSSProperties {
  return {
    transform: layerTransform(layer, phase, parallax),
    transition:
      phase === 'entering'
        ? `transform ${ENTER_DURATION_MS}ms ${ENTER_EASING}`
        : `transform 1300ms ${OPEN_EASING}`,
  };
}

function textStyle(phase: Phase, { x, y }: Parallax): CSSProperties {
  const entering = phase === 'entering';
  const closed = phase === 'closed';
  const dx = entering ? 0 : 26 * x - 5 * y;
  const dy = entering ? 0 : 20 * y + 4 * x;

  return {
    transform: `translate3d(calc(-50% + ${dx}px), calc(-50% + ${dy}px), 0) scale(${closed ? 0.8 : entering ? 3.5 : 1})`,
    opacity: closed || entering ? 0 : 1,
    transition: entering
      ? `transform ${ENTER_DURATION_MS}ms ${ENTER_EASING}, opacity 800ms ${ENTER_EASING}`
      : `transform 1300ms ${OPEN_EASING}, opacity 1300ms ${OPEN_EASING}`,
  };
}

const panelSize: CSSProperties = {
  aspectRatio: String(PANEL_RATIO),
  height: '300svh',
  width: `max(300vw, ${100 * PANEL_RATIO * 3}svh)`,
};

function IntroArcoOverlay() {
  const reducedMotion = useReducedMotion() ?? false;
  const [phase, setPhase] = useState<Phase>('closed');
  const [parallax, setParallax] = useState<Parallax>({ x: 0, y: 0 });
  const [loadedCount, setLoadedCount] = useState(0);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const isReady = loadedCount >= 3 || loadTimedOut;
  const exitDuration = reducedMotion ? REDUCED_MOTION_DURATION_MS : ENTER_DURATION_MS;

  useEffect(() => {
    let cancelled = false;
    const markLoaded = () => {
      if (!cancelled) setLoadedCount((count) => count + 1);
    };

    [BACKGROUND_SRC, LEFT_PANEL_SRC, RIGHT_PANEL_SRC].forEach((src) => {
      const image = new Image();
      image.onload = markLoaded;
      image.onerror = markLoaded;
      image.src = src;
    });

    const timer = window.setTimeout(() => setLoadTimedOut(true), LOAD_TIMEOUT_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  // Com as imagens carregadas, as flores se abrem para os lados revelando o arco.
  useEffect(() => {
    if (!isReady || phase !== 'closed') return;
    const frame = window.requestAnimationFrame(() => setPhase('open'));
    return () => window.cancelAnimationFrame(frame);
  }, [isReady, phase]);

  // Trava a rolagem da página enquanto a introdução está na tela.
  useEffect(() => {
    if (phase === 'done') return;

    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    window.scrollTo(0, 0);
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'entering') return;
    const timer = window.setTimeout(() => {
      hasEnteredSite = true;
      setPhase('done');
    }, exitDuration);
    return () => window.clearTimeout(timer);
  }, [phase, exitDuration]);

  if (phase === 'done') return null;

  const handleEnter = () => {
    if (phase !== 'open') return;
    // Disparado de forma síncrona dentro do clique, para o navegador permitir o play() do áudio.
    window.dispatchEvent(new Event(INTRO_ENTER_EVENT));
    setPhase('entering');
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (reducedMotion || phase !== 'open') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const clamp = (value: number) => Math.max(-1, Math.min(1, value));
    setParallax({
      x: clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2),
      y: clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2),
    });
  };

  const shownPhase: Phase = reducedMotion && phase === 'entering' ? 'open' : phase;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ENTER_LABEL}
      aria-describedby="intro-arco-text"
      className="fixed inset-0 z-[80] cursor-pointer overflow-hidden focus:outline-none"
      data-state={phase}
      onClick={handleEnter}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleEnter();
        }
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setParallax({ x: 0, y: 0 })}
      style={{
        // Fundo escuro só enquanto as imagens carregam; depois o site aparece pelo buraco do arco.
        backgroundColor: phase === 'closed' ? '#000' : 'transparent',
        opacity: reducedMotion && phase === 'entering' ? 0 : 1,
        transition: `opacity ${exitDuration}ms ease`,
      }}
    >
      <span id="intro-arco-text" className="sr-only">
        {INTRO_TEXT}
      </span>

      <div
        className="pointer-events-none absolute left-1/2 top-1/2 z-10 will-change-transform"
        style={{ width: '1200vw', height: '1200svh', ...layerStyle('background', shownPhase, parallax) }}
      >
        <img
          src={BACKGROUND_SRC}
          alt=""
          className="absolute inset-0 h-full w-full max-w-none object-cover"
          style={{ objectPosition: '54% 50%' }}
        />
      </div>

      {/* Texto logo acima do "Clique para entrar" (bottom-10 / md:bottom-14), na frente das flores. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[calc(100%-8.5rem)] z-40 md:top-[calc(100%-10rem)] w-[90%] max-w-xl text-center will-change-transform"
        style={textStyle(shownPhase, parallax)}
      >
        <p className="font-display text-xl font-light italic tracking-[0.08em] text-white/90 drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] md:text-2xl lg:text-3xl">
          {INTRO_TEXT}
        </p>
      </div>

      <div
        className="pointer-events-none absolute left-1/2 top-1/2 z-20 max-w-none will-change-transform"
        style={{ ...panelSize, ...layerStyle('left', shownPhase, parallax) }}
      >
        <img src={LEFT_PANEL_SRC} alt="" className="h-full w-full max-w-none object-contain" />
      </div>

      <div
        className="pointer-events-none absolute left-1/2 top-1/2 z-30 max-w-none will-change-transform"
        style={{ ...panelSize, ...layerStyle('right', shownPhase, parallax) }}
      >
        <img src={RIGHT_PANEL_SRC} alt="" className="h-full w-full max-w-none object-contain" />
      </div>

      <span
        aria-hidden="true"
        className="absolute bottom-10 left-1/2 z-40 inline-flex min-h-11 -translate-x-1/2 items-center justify-center whitespace-nowrap px-1 py-2 text-xs font-medium uppercase tracking-[0.16em] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] md:bottom-14"
        style={{
          opacity: phase === 'open' ? 1 : 0,
          transition: phase === 'open' ? 'opacity 450ms ease 950ms' : 'opacity 300ms ease',
        }}
      >
        {ENTER_LABEL}
      </span>
    </div>
  );
}

// A introdução só existe na home (/login; a raiz "/" redireciona para lá).
const INTRO_PATH = '/login';
// Depois que a pessoa entra, voltar para a home pela navegação do site não repete a introdução.
let hasEnteredSite = false;

export function IntroArco() {
  const pathname = usePathname();

  if (pathname !== INTRO_PATH || hasEnteredSite) {
    return null;
  }

  return <IntroArcoOverlay />;
}
