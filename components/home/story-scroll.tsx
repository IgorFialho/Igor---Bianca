"use client";

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Portal } from './portal';
import { Reveal } from './reveal';

/** position: ponto de foco (object-position) opcional. */
export type StoryPhoto = { src: string; caption: string; position?: string };
export type StoryChapter = {
  title: string;
  text: string;
  photos: StoryPhoto[];
  /** Lado do texto no computador; por padrão alterna esquerda, direita, esquerda... */
  side?: 'left' | 'right';
  /** Largura das polaroids no computador (% da área); por padrão 45, 55 e 65 como na Cordially. */
  width?: 45 | 55 | 65;
};

type StoryScrollProps = {
  id: string;
  title: string;
  chapters: StoryChapter[];
};

// Tudo abaixo replica a seção "our story" (data-design-scroll-freeze) do template Origins da Cordially.
const ROTATIONS = [-2.5, 1.8, -1.2];
const DEFAULT_WIDTHS = [45, 55, 65] as const;
// Cada polaroid nova entra após rolar meia tela (50svh).
const CARD_GAP_VH = 50;
// Distância (px) em que uma polaroid "pousa" sobre a pilha.
const STACK_BLEND_PX = 140;

type Card = {
  photo: StoryPhoto;
  width: number;
  chapterIndex: number;
  rotation: number;
};

type CaptionGroup = { chapter: StoryChapter; side: 'left' | 'right'; startCardIndex: number };

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

// Quanto do texto do celular cabe: textos longos ficam com letra menor (igual à Cordially).
function mobileTextClass(text: string) {
  const length = text.trim().length;
  if (length >= 180) return 'mx-auto max-w-[42rem] text-[clamp(0.78rem,3.15vw,0.92rem)] leading-[1.32]';
  if (length >= 120) return 'mx-auto max-w-[42rem] text-[clamp(0.9rem,3.6vw,1rem)] leading-[1.38]';
  return 'mx-auto max-w-[42rem] text-lg leading-[1.55]';
}

function ChapterCaption({ chapter, mobile = false }: { chapter: StoryChapter; mobile?: boolean }) {
  return (
    <>
      <h3
        className={`font-display font-bold text-zinc-800 ${
          mobile ? 'mb-2 text-[clamp(1.25rem,5vw,1.5rem)] leading-tight' : 'mb-2 text-2xl'
        }`}
      >
        {chapter.title}
      </h3>
      <p className={`text-zinc-600 ${mobile ? mobileTextClass(chapter.text) : 'text-lg'}`}>{chapter.text}</p>
    </>
  );
}

// Largura da janela e altura da área presa na tela (100svh).
function useViewport(stickyRef: React.RefObject<HTMLDivElement>) {
  const [viewport, setViewport] = useState({ width: 1000, height: 1000 });
  useEffect(() => {
    const update = () =>
      setViewport({ width: window.innerWidth, height: stickyRef.current?.clientHeight || window.innerHeight });
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [stickyRef]);
  return viewport;
}

// "Nossa história": a seção fica presa na tela; cada meia tela de rolagem traz uma polaroid de baixo
// para cima, que pousa 20px abaixo da anterior (formando uma pilha), e o texto do capítulo aparece ao lado.
export function StoryScroll({ id, title, chapters }: StoryScrollProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const captionRefs = useRef<HTMLDivElement[][]>([]);
  const [titleHeight, setTitleHeight] = useState(220);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const { width: viewportWidth, height: viewportHeight } = useViewport(stickyRef);

  const cards = useMemo<Card[]>(
    () =>
      chapters.flatMap((chapter, chapterIndex) =>
        chapter.photos.map((photo, photoIndex) => ({
          photo,
          width: chapter.width ?? DEFAULT_WIDTHS[chapterIndex % DEFAULT_WIDTHS.length],
          chapterIndex,
          rotation: ROTATIONS[(cardIndexOffset(chapters, chapterIndex) + photoIndex) % ROTATIONS.length],
        })),
      ),
    [chapters],
  );

  const captionGroups = useMemo<CaptionGroup[]>(() => {
    let start = 0;
    return chapters.map((chapter, index) => {
      const group = { chapter, side: chapter.side ?? (index % 2 === 0 ? 'left' : 'right'), startCardIndex: start } as CaptionGroup;
      start += chapter.photos.length;
      return group;
    });
  }, [chapters]);

  // Altura do título (o layout das polaroids é calculado a partir dela).
  useLayoutEffect(() => {
    const element = titleRef.current;
    if (!element) return;
    const update = () => setTitleHeight(element.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Foto ampliada: trava a página e fecha com Esc.
  useEffect(() => {
    if (openIndex === null) return;
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenIndex(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKey);
    };
  }, [openIndex]);

  // ---- Medidas (mesmas fórmulas da Cordially) ----
  const isMobile = viewportWidth < 768;
  const isWideMobile = isMobile && viewportWidth >= 420;
  const contentWidth = Math.min(viewportWidth, 1400) - (isMobile ? 32 : 64);
  const titleTop = isMobile ? 96 : 80;
  const captionGap = isWideMobile ? 12 : 24;
  const mobileCaptionHeight = isWideMobile ? 84 : 100;
  const stackStep = isMobile ? 14 : 20;
  const stackDepth = Math.max(cards.length - 1, 0) * stackStep;
  const cardGapPx = (CARD_GAP_VH * viewportHeight) / 100;

  const cardSizes = cards.map((card) => {
    let width: number;
    if (isMobile) {
      width = 0.85 * contentWidth;
    } else {
      const total = 50 + card.width;
      width = contentWidth * (total > 100 ? card.width / total : card.width / 100) - 32;
    }
    width = Math.max(10, width);
    return { width, height: 0.75 * width };
  });
  const tallest = cardSizes.length ? Math.max(...cardSizes.map((size) => size.height)) : 0;

  const available = isMobile
    ? viewportHeight -
      (titleTop + titleHeight + captionGap + mobileCaptionHeight + (isWideMobile ? 16 : 40)) -
      (isWideMobile ? 22 : 28) -
      stackDepth
    : viewportHeight - (titleTop + titleHeight + 16) - 32 - stackDepth;
  const heightScale = tallest > available && tallest > 0 ? Math.max(isMobile ? 0.6 : 0.4, available / tallest) : 1;

  const desktopTop = Math.max(titleTop + titleHeight + 16, (viewportHeight - (tallest * heightScale + stackDepth)) / 2);
  const mobileCaptionTop = titleTop + titleHeight + captionGap;
  const cardsTop = isMobile ? mobileCaptionTop + mobileCaptionHeight + (isWideMobile ? 16 : 60) : desktopTop;
  const titleLift = isWideMobile ? Math.min(8, 0.08 * titleHeight) : 0;
  const sectionHeight = `calc(${100 + Math.max(cards.length - 1, 0) * CARD_GAP_VH}svh)`;

  // ---- Animação ligada à rolagem (atualiza o DOM direto, sem re-render) ----
  useEffect(() => {
    const stacked = new Float64Array(cards.length);
    let frame: number | null = null;

    const render = () => {
      frame = null;
      const section = sectionRef.current;
      if (!section) return;
      const rect = section.getBoundingClientRect();
      if (rect.bottom < -window.innerHeight || rect.top > 1.5 * window.innerHeight) return;

      const scrolled = Math.max(0, -rect.top);
      const liftDistance = isMobile && !isWideMobile ? Math.max(0.85 * cardGapPx, 320) : Math.max(0.5 * cardGapPx, 220);
      const lift = isMobile ? Math.min(Math.max(scrolled / liftDistance, 0), 1) : 0;

      // Quantas polaroids depois de cada uma já pousaram na pilha.
      let landed = 0;
      for (let index = cards.length - 1; index >= 0; index -= 1) {
        stacked[index] = landed;
        landed += clamp01((scrolled - (index * cardGapPx - STACK_BLEND_PX)) / STACK_BLEND_PX);
      }
      const baseOffset = (stacked[0] ?? 0) * stackStep;

      cards.forEach((_, index) => {
        const offset = Math.max(index * cardGapPx - scrolled, 0) - stacked[index] * stackStep + baseOffset;
        const element = cardRefs.current[index];
        if (element) element.style.transform = `translate3d(0, ${offset}px, 0)`;
      });

      captionGroups.forEach((group, index) => {
        const start = group.startCardIndex * cardGapPx;
        const next = captionGroups[index + 1];
        const end = next ? next.startCardIndex * cardGapPx : Infinity;
        const fadeIn = clamp01((scrolled - (start - 260)) / 260);
        let fadeOut = 1;
        if (Number.isFinite(end) && end - scrolled < 600) fadeOut = Math.max(0, (end - scrolled) / 600);
        const opacity = fadeIn * fadeOut;
        const y = (1 - fadeIn) * 24 - (1 - fadeOut) * 40 - lift * titleLift;
        (captionRefs.current[index] ?? []).forEach((element) => {
          element.style.opacity = String(opacity);
          element.style.transform = `translate3d(0, ${y}px, 0)`;
        });
      });
    };

    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(render);
    };

    render();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [cards, captionGroups, cardGapPx, isMobile, isWideMobile, stackStep, titleLift]);

  const registerCaption = (groupIndex: number) => (element: HTMLDivElement | null) => {
    if (!element) return;
    const list = (captionRefs.current[groupIndex] ??= []);
    if (!list.includes(element)) list.push(element);
  };

  const openPhoto = openIndex !== null ? cards[openIndex]?.photo : null;

  return (
    <section id={id} ref={sectionRef} className="relative z-30 w-full" style={{ height: sectionHeight }}>
      <div ref={stickyRef} className="sticky top-0 h-[100svh] w-full">
        {/* Título */}
        <div
          className="pointer-events-none absolute inset-x-0 z-10 flex flex-col items-center justify-center"
          style={{ top: `${titleTop}px`, transformOrigin: isMobile ? 'top center' : 'center center' }}
        >
          <div className="relative mx-auto flex w-full max-w-[375px] flex-col items-center justify-center px-4 md:max-w-[1280px]">
            <Reveal className="flex w-full items-center justify-center">
              <h2
                ref={titleRef}
                className="block w-full max-w-full whitespace-nowrap text-center font-display text-[min(14vw,3.28125rem)] leading-none tracking-tight text-zinc-800 md:text-[min(14vw,11.2rem)]"
              >
                {title}
              </h2>
            </Reveal>
          </div>
        </div>

        {/* Texto dos capítulos no computador: ao lado da pilha, alternando os lados */}
        {captionGroups.map((group, index) => {
          const spacerWidth = (cardSizes[group.startCardIndex]?.width ?? 0) * heightScale;
          const row = (
            <div className="mx-auto flex w-full max-w-[1400px] items-center justify-center px-4 md:px-8">
              {group.side === 'left' ? (
                <>
                  <div className="w-1/4 px-4 text-right">
                    <ChapterCaption chapter={group.chapter} />
                  </div>
                  <div className="mx-4 shrink-0" style={{ width: `${spacerWidth}px` }} />
                  <div className="w-1/4" />
                </>
              ) : (
                <>
                  <div className="w-1/4" />
                  <div className="mx-4 shrink-0" style={{ width: `${spacerWidth}px` }} />
                  <div className="w-1/4 px-4 text-left">
                    <ChapterCaption chapter={group.chapter} />
                  </div>
                </>
              )}
            </div>
          );
          return (
            <div
              key={`desktop-${group.chapter.title}`}
              ref={registerCaption(index)}
              className="pointer-events-none absolute inset-x-0 z-[35] hidden md:block"
              style={{ top: `${cardsTop}px`, opacity: index === 0 ? 1 : 0 }}
            >
              {index === 0 ? <Reveal delay={0.14}>{row}</Reveal> : row}
            </div>
          );
        })}

        {/* Texto dos capítulos no celular: centralizado entre o título e as fotos */}
        {captionGroups.map((group, index) => (
          <div
            key={`mobile-${group.chapter.title}`}
            ref={registerCaption(index)}
            className="pointer-events-none absolute inset-x-0 z-[35] px-4 text-center md:hidden"
            style={{ top: `${mobileCaptionTop}px`, opacity: index === 0 ? 1 : 0 }}
          >
            {index === 0 ? (
              <Reveal delay={0.14} className="flex w-full flex-col items-center justify-center">
                <ChapterCaption chapter={group.chapter} mobile />
              </Reveal>
            ) : (
              <ChapterCaption chapter={group.chapter} mobile />
            )}
          </div>
        ))}

        {/* Polaroids */}
        {cards.map((card, index) => (
          <div
            key={`${card.photo.src}-${index}`}
            ref={(element) => {
              cardRefs.current[index] = element;
            }}
            className="pointer-events-auto absolute inset-x-0 z-20 mx-auto flex w-full max-w-[1400px] flex-col items-center justify-center px-4 md:flex-row md:px-8"
            style={{ top: `${cardsTop}px`, zIndex: 20 + index, transform: 'translate3d(0, 0, 0)', backfaceVisibility: 'hidden' }}
          >
            <div className="hidden w-1/4 md:block" />
            <div
              className="relative mx-4 shrink-0 transform-gpu"
              style={{ width: `${(cardSizes[index]?.width ?? 0) * heightScale}px`, height: `${(cardSizes[index]?.height ?? 0) * heightScale}px` }}
            >
              <div className="h-full w-full transition-transform duration-300 ease-out md:hover:-translate-y-4 md:hover:scale-[1.03]">
                <div
                  className={`relative h-full w-full rounded-[0.45rem] border border-black/10 bg-[#f8f3e8] p-[4.5%] pb-[18%] transition-shadow duration-300 ${
                    isMobile
                      ? 'shadow-[0_6px_20px_rgba(0,0,0,0.2)]'
                      : 'shadow-[0_14px_42px_rgba(0,0,0,0.32)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)]'
                  }`}
                  style={{ transform: `rotate(${card.rotation}deg)` }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenIndex(index)}
                    aria-label={`Ver foto maior: ${card.photo.caption}`}
                    aria-haspopup="dialog"
                    className="h-full w-full cursor-pointer"
                  >
                    <div className="relative h-full w-full overflow-hidden rounded-[0.2rem] bg-black/5">
                      <img
                        src={card.photo.src}
                        alt={card.photo.caption}
                        loading={index <= 2 ? 'eager' : 'lazy'}
                        className="absolute inset-0 h-full w-full object-cover"
                        style={{ objectPosition: card.photo.position }}
                      />
                    </div>
                  </button>
                  <p className="absolute bottom-[7%] left-1/2 block max-w-[90%] -translate-x-1/2 whitespace-nowrap text-center text-[clamp(0.7rem,1.8vw,1rem)] text-black/70">
                    {card.photo.caption}
                  </p>
                </div>
              </div>
            </div>
            <div className="hidden w-1/4 md:block" />
          </div>
        ))}
      </div>

      {/* Foto ampliada ao clicar numa polaroid; fecha com clique ou Esc. Fica no <body>, acima de tudo
          (menu z-50, player z-60), e não dentro da seção, que tem a própria camada. */}
      <Portal>
        <AnimatePresence>
          {openPhoto ? (
            <motion.div
              key={openPhoto.src + openPhoto.caption}
              role="dialog"
              aria-modal="true"
              aria-label={openPhoto.caption}
              className="fixed inset-0 z-[200] flex cursor-zoom-out flex-col items-center justify-center gap-4 bg-black/85 p-6"
              onClick={() => setOpenIndex(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <motion.img
                src={openPhoto.src}
                alt={openPhoto.caption}
                className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-2xl"
                initial={{ scale: 0.94 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.94 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              />
              <p className="text-sm text-white/80">{openPhoto.caption}</p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Portal>
    </section>
  );
}

// Índice global da primeira polaroid de um capítulo (a inclinação segue a ordem de todas as fotos).
function cardIndexOffset(chapters: StoryChapter[], chapterIndex: number) {
  return chapters.slice(0, chapterIndex).reduce((total, chapter) => total + chapter.photos.length, 0);
}
