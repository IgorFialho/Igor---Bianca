"use client";

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { FittedText } from './fitted-text';

/** Foto com ponto de foco (object-position, ex.: "50% 30%") para enquadrar os rostos. */
export type HeroPhoto = { src: string; position?: string };

type HeroProps = {
  id: string;
  imageSrc: string;
  /** Ponto de foco da foto principal (object-position), para os rostos não serem cortados. */
  imagePosition?: string;
  imageAlt: string;
  headline: string;
  scrollLabel: string;
  /** 4 fotos que entram em volta da principal durante a rolagem. */
  galleryImages: [HeroPhoto, HeroPhoto, HeroPhoto, HeroPhoto];
};

// Quantos pixels de rolagem a animação leva; a seção fica presa na tela durante esse trecho.
export const HERO_SCROLL_DISTANCE = 1200;

type LayoutMode = 'desktop-side' | 'tablet-side' | 'phone-stacked';
type Card = { width: number; height: number; translateX: number; translateY: number; scale: number; borderRadius: number; opacity: number };
type Column = { top: number; width: number; height: number; cards: [Card, Card] };
type Row = { top: number; left: number; width: number; height: number; cards: [Card, Card] };
type GalleryLayout =
  | { layout: 'side'; heroCenterOffset: number; gap: number; leftColumn: Column; rightColumn: Column }
  | { layout: 'stacked'; gap: number; topRow: Row; bottomRow: Row };

// A matemática abaixo segue a do hero "origins-gallery" da Cordially.
const clamp = (value: number, min = 0, max = 1) => Math.min(Math.max(value, min), max);
const easeOutQuint = (value: number) => 1 - Math.pow(1 - value, 5);

function getLayoutMode(viewportWidth: number): LayoutMode {
  if (viewportWidth >= 1024) return 'desktop-side';
  if (viewportWidth >= 768) return 'tablet-side';
  return 'phone-stacked';
}

// No celular: uma fileira de fotos acima e outra abaixo da foto principal.
function phoneMetrics(vw: number, vh: number) {
  const gap = clamp(0.012 * vh, 8, 10);
  const rowWidth = Math.max(vw - 24, 0);
  const rowHeight = clamp(0.19 * vh, 96, 160);
  const heroHeight = Math.min(Math.max(vh - 82 - 12 - 2 * rowHeight - 2 * gap, 0), clamp(0.48 * vh, 220, 420));
  const heroTop = 82 + rowHeight + gap;
  const cardsWidth = Math.max(rowWidth - 8, 0);
  const wideCardWidth = 0.58 * cardsWidth;

  return {
    outerMargin: 12,
    rowGap: 8,
    rowWidth,
    rowHeight,
    wideCardWidth,
    narrowCardWidth: cardsWidth - wideCardWidth,
    heroWidth: rowWidth,
    heroHeight,
    heroTop,
    topRowTop: 82,
    bottomRowTop: heroTop + heroHeight + gap,
  };
}

// Tamanho final da foto principal quando a animação termina.
function finalHeroSize(vw: number, vh: number, mode: LayoutMode) {
  if (mode === 'phone-stacked') {
    const metrics = phoneMetrics(vw, vh);
    return { width: metrics.heroWidth, height: metrics.heroHeight };
  }
  if (mode === 'tablet-side') {
    return { width: clamp(0.46 * vw, 360, 480), height: Math.min(Math.max(0.72 * vh, 500), 720, 0.9 * vh) };
  }
  return { width: clamp(0.46 * vw, 380, 560), height: clamp(0.8 * vh, 520, 760) };
}

function heroFrame(vw: number, vh: number, progress: number, mode: LayoutMode) {
  const isPhone = mode === 'phone-stacked';
  const target = finalHeroSize(vw, vh, mode);
  const startWidth = isPhone ? vw - 24 : 0.97 * vw;
  const startHeight = isPhone ? vh - 24 : 0.97 * vh;
  const endTranslateY = isPhone ? phoneMetrics(vw, vh).heroTop - (vh - target.height) / 2 : 12;

  return {
    width: startWidth - (startWidth - target.width) * progress,
    height: startHeight - (startHeight - target.height) * progress,
    translateY: progress * endTranslateY,
    borderRadius: isPhone ? 24 + 10 * progress : 18 + 28 * progress,
    textOpacity: clamp(1 - 1.45 * progress),
    overlayOpacity: clamp(0.22 - 0.2 * progress),
    textScale: 1 - 0.12 * progress,
  };
}

function galleryLayout(vw: number, vh: number, progress: number, mode: LayoutMode): GalleryLayout {
  if (mode === 'phone-stacked') {
    const m = phoneMetrics(vw, vh);
    const eased = easeOutQuint(clamp((progress - 0.28) / 0.72));
    const stage = (start: number) => clamp((eased - start) / (1 - start));
    const shiftX = 0.08 * vw;
    const fromTop = [
      Math.max(0.35 * vh, m.topRowTop + m.rowHeight + 40),
      Math.max(0.38 * vh, m.topRowTop + m.rowHeight + 70),
    ];
    const fromBottom = [
      Math.max(0.32 * vh, vh - m.bottomRowTop + 40),
      Math.max(0.36 * vh, vh - m.bottomRowTop + 70),
    ];
    const card = (width: number, t: number, x: number, y: number, borderRadius: number): Card => ({
      width,
      height: m.rowHeight,
      translateX: x * (1 - t),
      translateY: y * (1 - t),
      scale: 0.94 + 0.06 * t,
      borderRadius,
      opacity: clamp(4 * t),
    });
    const row = (top: number, cards: [Card, Card]): Row => ({ top, left: m.outerMargin, width: m.rowWidth, height: m.rowHeight, cards });

    return {
      layout: 'stacked',
      gap: m.rowGap,
      topRow: row(m.topRowTop, [
        card(m.wideCardWidth, stage(0), -shiftX, -fromTop[0], 22),
        card(m.narrowCardWidth, stage(0.18), shiftX, -fromTop[1], 24),
      ]),
      bottomRow: row(m.bottomRowTop, [
        card(m.narrowCardWidth, stage(0.38), -shiftX, fromBottom[0], 24),
        card(m.wideCardWidth, stage(0.58), shiftX, fromBottom[1], 22),
      ]),
    };
  }

  const eased = easeOutQuint(clamp(progress));
  const stage = (start: number) => clamp((eased - start) / (1 - start));
  const halfWidth = vw / 2;
  const hero = finalHeroSize(vw, vh, mode);
  const isTablet = mode === 'tablet-side';
  const edge = isTablet ? 12 : 24;
  const sideSpace = (vw - hero.width) / 2;
  const rightSpace = vw - (sideSpace + hero.width) - edge;
  const gap = isTablet ? 8 : 10;
  const maxColumn = Math.max(Math.min(sideSpace - edge, rightSpace) - gap, 0);
  const columnWidth = isTablet ? Math.min(Math.max(0.22 * vw, 140), maxColumn) : Math.min(Math.max(0.23 * vw, 210), maxColumn);
  const narrowWidth = isTablet ? Math.max(Math.min(0.8 * columnWidth, columnWidth - 20), 120) : Math.max(Math.min(0.78 * columnWidth, columnWidth - 28), 160);
  const heroTop = (vh - hero.height) / 2;
  const tallHeight = isTablet ? clamp(0.4 * hero.height, 220, 310) : clamp(0.48 * hero.height, 260, 360);
  const shortHeight = isTablet ? clamp(0.24 * hero.height, 140, 200) : clamp(0.28 * hero.height, 160, 240);
  const columnHeight = shortHeight + tallHeight + gap;
  const leftTop = Math.max(heroTop - (isTablet ? 40 : 60), 8);
  const rightTop = Math.max(Math.min(heroTop + hero.height + (isTablet ? 64 : 100), vh - edge) - columnHeight, 8);
  const card = (width: number, height: number, t: number, direction: -1 | 1, borderRadius: number): Card => ({
    width,
    height,
    translateX: direction * halfWidth * (1 - t),
    translateY: 400 * (1 - t),
    scale: 0.96 + 0.04 * t,
    borderRadius,
    opacity: clamp(4 * t),
  });

  return {
    layout: 'side',
    heroCenterOffset: hero.width / 2 + gap,
    gap,
    leftColumn: {
      top: leftTop,
      width: columnWidth,
      height: columnHeight,
      cards: [card(columnWidth, tallHeight, stage(0), -1, 26), card(narrowWidth, shortHeight, stage(0.3), -1, 22)],
    },
    rightColumn: {
      top: rightTop,
      width: columnWidth,
      height: columnHeight,
      cards: [card(narrowWidth, shortHeight, stage(0.4), 1, 24), card(columnWidth, tallHeight, stage(0.75), 1, 28)],
    },
  };
}

function GalleryCard({ photo, card }: { photo: HeroPhoto; card: Card }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden"
      style={{
        width: card.width,
        height: card.height,
        borderRadius: card.borderRadius,
        transform: `translateX(${card.translateX}px) translateY(${card.translateY}px) scale(${card.scale})`,
        opacity: card.opacity,
        willChange: 'transform, opacity',
      }}
    >
      <img src={photo.src} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: photo.position }} />
    </div>
  );
}

// Foto do casal em tela cheia que, ao rolar, encolhe até virar um cartão no centro enquanto
// outras 4 fotos chegam pelos lados (no celular, por cima e por baixo).
export function Hero({ id, imageSrc, imagePosition, imageAlt, headline, scrollLabel, galleryImages }: HeroProps) {
  const ref = useRef<HTMLElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const section = ref.current;
      if (!section) return;
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      setProgress(clamp(-section.getBoundingClientRect().top / HERO_SCROLL_DISTANCE));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  const hasViewport = viewport.width > 0 && viewport.height > 0;
  const mode = getLayoutMode(viewport.width);
  const frame = hasViewport ? heroFrame(viewport.width, viewport.height, progress, mode) : null;
  const gallery = hasViewport ? galleryLayout(viewport.width, viewport.height, progress, mode) : null;
  const [first, second, third, fourth] = galleryImages;

  const frameStyle: CSSProperties = frame
    ? { width: frame.width, height: frame.height, transform: `translateY(${frame.translateY}px)`, borderRadius: frame.borderRadius }
    : { width: 'calc(100% - 24px)', height: 'calc(100% - 24px)', borderRadius: 24 };

  return (
    <section id={id} ref={ref} className="relative" style={{ height: `calc(100svh + ${HERO_SCROLL_DISTANCE}px)` }}>
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative overflow-hidden will-change-transform" style={frameStyle}>
            <img src={imageSrc} alt={imageAlt} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: imagePosition }} />
            <div className="absolute inset-0 bg-black/20" style={{ opacity: frame?.overlayOpacity ?? 0.22 }} />

            <div
              className="absolute inset-0 flex flex-col items-center justify-end pb-8 text-white"
              style={{ opacity: frame?.textOpacity ?? 1 }}
            >
              <h1
                className="pointer-events-none absolute inset-x-0 bottom-32 flex justify-center px-6 md:px-12"
                style={{ transform: `scale(${frame?.textScale ?? 1})`, transformOrigin: 'bottom center' }}
              >
                <span className="sr-only">{headline}</span>
                <FittedText text={headline} />
              </h1>
              <div className="relative z-10 flex w-full flex-col gap-6 px-6 pb-4 md:px-12">
                <div className="h-px w-full bg-white opacity-50" />
                <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.4em] opacity-90">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="animate-bounce opacity-80" aria-hidden="true">
                    <path d="M7 13l5 5 5-5M12 6v12" />
                  </svg>
                  <span>{scrollLabel}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {gallery?.layout === 'side' ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
            <div
              className="absolute flex flex-col items-end"
              style={{ right: `calc(50% + ${gallery.heroCenterOffset}px)`, top: gallery.leftColumn.top, width: gallery.leftColumn.width, height: gallery.leftColumn.height, gap: gallery.gap }}
            >
              <GalleryCard photo={first} card={gallery.leftColumn.cards[0]} />
              <GalleryCard photo={second} card={gallery.leftColumn.cards[1]} />
            </div>
            <div
              className="absolute flex flex-col items-start"
              style={{ left: `calc(50% + ${gallery.heroCenterOffset}px)`, top: gallery.rightColumn.top, width: gallery.rightColumn.width, height: gallery.rightColumn.height, gap: gallery.gap }}
            >
              <GalleryCard photo={third} card={gallery.rightColumn.cards[0]} />
              <GalleryCard photo={fourth} card={gallery.rightColumn.cards[1]} />
            </div>
          </div>
        ) : null}

        {gallery?.layout === 'stacked' ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
            {[gallery.topRow, gallery.bottomRow].map((row, rowIndex) => (
              <div key={rowIndex} className="absolute flex" style={{ left: row.left, top: row.top, width: row.width, height: row.height, gap: gallery.gap }}>
                <GalleryCard photo={rowIndex === 0 ? first : third} card={row.cards[0]} />
                <GalleryCard photo={rowIndex === 0 ? second : fourth} card={row.cards[1]} />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
