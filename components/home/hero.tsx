"use client";

import { forwardRef, useEffect, useRef, useState, type CSSProperties } from 'react';
import { INTRO_ENTER_EVENT, introHoleRect, shouldSkipIntro } from '@/components/intro-arco';
import { FittedText } from './fitted-text';

/** Foto com ponto de foco (object-position, ex.: "50% 30%") para enquadrar os rostos. */
export type HeroPhoto = { src: string; position?: string };

type HeroProps = {
  id: string;
  imageSrc: string;
  /** Ponto de foco da foto principal (object-position), para os rostos não serem cortados. */
  imagePosition?: string;
  imageAlt: string;
  /**
   * Onde está o casal na foto principal (frações da imagem). Enquanto a introdução está aberta, a foto
   * encolhe para o casal aparecer de corpo inteiro no centro do buraco do arco.
   */
  introFocus?: { centerX: number; centerY: number; width: number; height: number };
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

/** Estilos que mudam com a rolagem (aplicados direto nos elementos, sem redesenhar o componente). */
type ScrollStyles = {
  frame: { width: string; height: string; transform: string; borderRadius: string } | null;
  image: { transform: string } | null;
  overlayOpacity: string;
  textOpacity: string;
  titleTransform: string;
  cards: { transform: string; opacity: string }[];
};

/** Cartões da galeria na ordem das fotos (1ª, 2ª, 3ª e 4ª), qualquer que seja o layout. */
function galleryCards(gallery: GalleryLayout): Card[] {
  return gallery.layout === 'side'
    ? [...gallery.leftColumn.cards, ...gallery.rightColumn.cards]
    : [...gallery.topRow.cards, ...gallery.bottomRow.cards];
}

const cardTransform = (card: Card) => `translate3d(${card.translateX}px, ${card.translateY}px, 0) scale(${card.scale})`;

const GalleryCard = forwardRef<HTMLDivElement, { photo: HeroPhoto; card: Card }>(function GalleryCard({ photo, card }, ref) {
  return (
    <div
      ref={ref}
      className="relative shrink-0 overflow-hidden"
      style={{
        width: card.width,
        height: card.height,
        borderRadius: card.borderRadius,
        transform: cardTransform(card),
        opacity: card.opacity,
        willChange: 'transform, opacity',
      }}
    >
      <img src={photo.src} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: photo.position }} />
    </div>
  );
});

// Foto do casal em tela cheia que, ao rolar, encolhe até virar um cartão no centro enquanto
// outras 4 fotos chegam pelos lados (no celular, por cima e por baixo).
// Lê "52% 62%" como frações [0.52, 0.62] (padrão: centro).
function parsePosition(position?: string): [number, number] {
  const parts = (position ?? '').match(/-?[\d.]+%/g);
  if (!parts || parts.length < 2) return [0.5, 0.5];
  return [parseFloat(parts[0]) / 100, parseFloat(parts[1]) / 100];
}

const INTRO_EASING = 'cubic-bezier(0.74, 0, 0.16, 1)';

export function Hero({ id, imageSrc, imagePosition, imageAlt, introFocus, headline, scrollLabel, galleryImages }: HeroProps) {
  const ref = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Rolagem (0 a 1). Fica fora do estado: cada quadro da rolagem atualiza os estilos direto nos elementos, sem
  // redesenhar o componente (no celular, redesenhar a cada quadro e redimensionar a foto travava a rolagem).
  const progressRef = useRef(0);
  // Tamanho da área presa na tela (100svh) e da janela (usada só para o buraco do arco da introdução).
  // Só mudam ao redimensionar.
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
  // Começa igual no servidor e no navegador (introdução aberta) e o efeito abaixo fecha quando ela é pulada.
  // Ler o navegador aqui (isIntroPending) dava um valor no servidor e outro no navegador: o React não corrige
  // essa diferença em produção e o texto da foto de abertura ficava invisível (opacity 0) para quem chegava
  // por um link com #seção ou já tinha entrado antes.
  const [introOpen, setIntroOpen] = useState(() => Boolean(introFocus));
  const [justEntered, setJustEntered] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Introdução pulada (#seção ou já entrou antes): a foto não fica encaixada no arco.
  useEffect(() => {
    if (shouldSkipIntro()) setIntroOpen(false);
  }, []);

  // Ao clicar em "Clique para entrar", a foto volta ao tamanho normal junto com o zoom do arco.
  useEffect(() => {
    if (!introOpen) return;
    const handleEnter = () => {
      setIntroOpen(false);
      setJustEntered(true);
    };
    window.addEventListener(INTRO_ENTER_EVENT, handleEnter);
    return () => window.removeEventListener(INTRO_ENTER_EVENT, handleEnter);
  }, [introOpen]);

  useEffect(() => {
    if (!justEntered) return;
    const timer = window.setTimeout(() => setJustEntered(false), 2000);
    return () => window.clearTimeout(timer);
  }, [justEntered]);

  // Tamanho real da foto (também cobre o caso de ela já estar no cache antes do onLoad).
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth) setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
  }, [imageSrc]);

  const hasViewport = viewport.width > 0 && viewport.height > 0;
  const mode = getLayoutMode(viewport.width);
  const [positionX, positionY] = parsePosition(imagePosition);

  // A foto fica sempre no tamanho do início (cobrindo a moldura cheia) e encolhe por escala (GPU), sem ser
  // redimensionada a cada quadro. Origem da escala: o casal (ou o centro), a mesma da introdução.
  const startFrame = hasViewport ? heroFrame(viewport.width, viewport.height, 0, mode) : null;
  let base: { width: number; height: number; cover: number; originX: number; originY: number } | null = null;
  if (startFrame && naturalSize) {
    const cover = Math.max(startFrame.width / naturalSize.width, startFrame.height / naturalSize.height);
    const width = naturalSize.width * cover;
    const height = naturalSize.height * cover;
    base = {
      width,
      height,
      cover,
      originX: introFocus ? introFocus.centerX * width : width / 2,
      originY: introFocus ? introFocus.centerY * height : height / 2,
    };
  }

  // Introdução aberta: leva o casal ao centro do buraco do arco, em escala para caber de corpo inteiro (no
  // máximo 62% da largura e 56% da altura do buraco), mas nunca tão pequeno que a foto deixe parte do buraco descoberta.
  let introTransform: string | null = null;
  if (introOpen && introFocus && startFrame && base && naturalSize) {
    const offsetX = (startFrame.width - base.width) * positionX;
    const offsetY = (startFrame.height - base.height) * positionY;
    const hole = introHoleRect(windowSize.width, windowSize.height);
    const frameLeft = (viewport.width - startFrame.width) / 2;
    const frameTop = (viewport.height - startFrame.height) / 2;
    const targetX = hole.centerX;
    const targetY = hole.centerY + 0.06 * hole.height;
    const fitScale = Math.min((0.62 * hole.width) / (introFocus.width * base.width), (0.56 * hole.height) / (introFocus.height * base.height));
    const coverHoleScale = Math.max(
      (targetX - hole.left) / base.originX,
      (hole.right - targetX) / (base.width - base.originX),
      (targetY - hole.top) / base.originY,
      (hole.bottom - targetY) / (base.height - base.originY)
    );
    const scale = Math.min(1, Math.max(fitScale, coverHoleScale * 1.02));
    const anchorX = frameLeft + offsetX + base.originX;
    const anchorY = frameTop + offsetY + base.originY;
    introTransform = `translate3d(${offsetX + targetX - anchorX}px, ${offsetY + targetY - anchorY}px, 0) scale(${scale})`;
  }

  /** Tudo que muda com a rolagem, para um progresso (0 a 1). */
  const computeScrollStyles = (progress: number): ScrollStyles => {
    if (!hasViewport) {
      return { frame: null, image: null, overlayOpacity: '0.22', textOpacity: introOpen ? '0' : '1', titleTransform: 'scale(1)', cards: [] };
    }
    const frame = heroFrame(viewport.width, viewport.height, progress, mode);
    let image: ScrollStyles['image'] = null;
    if (base && naturalSize) {
      if (introTransform) image = { transform: introTransform };
      else {
        const cover = Math.max(frame.width / naturalSize.width, frame.height / naturalSize.height);
        const scale = cover / base.cover;
        const offsetX = (frame.width - naturalSize.width * cover) * positionX;
        const offsetY = (frame.height - naturalSize.height * cover) * positionY;
        // Escala pela origem (o casal): o deslocamento compensa para a foto ficar onde ficaria com o tamanho novo.
        image = {
          transform: `translate3d(${offsetX - base.originX * (1 - scale)}px, ${offsetY - base.originY * (1 - scale)}px, 0) scale(${scale})`,
        };
      }
    }
    const gallery = galleryLayout(viewport.width, viewport.height, progress, mode);
    return {
      frame: { width: `${frame.width}px`, height: `${frame.height}px`, transform: `translate3d(0, ${frame.translateY}px, 0)`, borderRadius: `${frame.borderRadius}px` },
      image,
      overlayOpacity: String(frame.overlayOpacity),
      textOpacity: introOpen ? '0' : String(frame.textOpacity),
      titleTransform: `scale(${frame.textScale})`,
      cards: galleryCards(gallery).map((card) => ({ transform: cardTransform(card), opacity: String(card.opacity) })),
    };
  };

  // A rolagem chama sempre a versão mais recente (com o tamanho de tela e o estado da introdução atuais).
  const applyRef = useRef<(progress: number) => void>(() => undefined);
  applyRef.current = (progress: number) => {
    const styles = computeScrollStyles(progress);
    if (styles.frame && frameRef.current) Object.assign(frameRef.current.style, styles.frame);
    if (styles.image && imageRef.current) imageRef.current.style.transform = styles.image.transform;
    if (overlayRef.current) overlayRef.current.style.opacity = styles.overlayOpacity;
    if (textRef.current) textRef.current.style.opacity = styles.textOpacity;
    if (titleRef.current) titleRef.current.style.transform = styles.titleTransform;
    styles.cards.forEach((card, index) => {
      const element = cardRefs.current[index];
      if (element) {
        element.style.transform = card.transform;
        element.style.opacity = card.opacity;
      }
    });
  };

  useEffect(() => {
    let frame = 0;
    // Rolagem: só o progresso (sem redesenhar o componente).
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const section = ref.current;
        if (!section) return;
        progressRef.current = clamp(-section.getBoundingClientRect().top / HERO_SCROLL_DISTANCE);
        applyRef.current(progressRef.current);
      });
    };
    // Tamanho da tela: só atualiza (e redesenha) quando muda de verdade.
    const measure = () => {
      const width = window.innerWidth;
      const height = stickyRef.current?.clientHeight || window.innerHeight;
      setViewport((current) => (current.width === width && current.height === height ? current : { width, height }));
      setWindowSize((current) => (current.width === width && current.height === window.innerHeight ? current : { width, height: window.innerHeight }));
      onScroll();
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Ao redesenhar (tamanho de tela, foto carregada, introdução), a rolagem atual já sai aplicada.
  const styles = computeScrollStyles(progressRef.current);
  const gallery = hasViewport ? galleryLayout(viewport.width, viewport.height, progressRef.current, mode) : null;
  const [first, second, third, fourth] = galleryImages;
  // A transição da foto só existe na entrada pela introdução; na rolagem, ela acompanha o dedo sem atraso.
  const imageTransition = introOpen || justEntered ? `transform 1700ms ${INTRO_EASING}` : 'none';

  const frameStyle: CSSProperties = styles.frame ?? { width: 'calc(100% - 24px)', height: 'calc(100% - 24px)', borderRadius: 24 };
  const setCard = (index: number) => (element: HTMLDivElement | null) => {
    cardRefs.current[index] = element;
  };

  return (
    <section id={id} ref={ref} className="relative" style={{ height: `calc(100svh + ${HERO_SCROLL_DISTANCE}px)` }}>
      <div ref={stickyRef} className="sticky top-0 h-[100svh] overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <div ref={frameRef} className="relative overflow-hidden will-change-transform" style={frameStyle}>
            <img
              ref={imageRef}
              src={imageSrc}
              alt={imageAlt}
              onLoad={(event) => setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
              className={base ? 'absolute left-0 top-0 max-w-none' : 'absolute inset-0 h-full w-full object-cover'}
              style={
                base
                  ? {
                      width: base.width,
                      height: base.height,
                      transform: styles.image?.transform,
                      transformOrigin: `${base.originX}px ${base.originY}px`,
                      transition: imageTransition,
                      willChange: 'transform',
                    }
                  : { objectPosition: imagePosition }
              }
            />
            <div ref={overlayRef} className="absolute inset-0 bg-black/20" style={{ opacity: styles.overlayOpacity }} />

            <div
              ref={textRef}
              className="absolute inset-0 flex flex-col items-center justify-end pb-8 text-white"
              style={{
                opacity: styles.textOpacity,
                transition: justEntered ? 'opacity 900ms ease 900ms' : undefined,
              }}
            >
              <h1
                ref={titleRef}
                className="pointer-events-none absolute inset-x-0 bottom-32 flex justify-center px-6 md:px-12"
                style={{ transform: styles.titleTransform, transformOrigin: 'bottom center' }}
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
              <GalleryCard ref={setCard(0)} photo={first} card={gallery.leftColumn.cards[0]} />
              <GalleryCard ref={setCard(1)} photo={second} card={gallery.leftColumn.cards[1]} />
            </div>
            <div
              className="absolute flex flex-col items-start"
              style={{ left: `calc(50% + ${gallery.heroCenterOffset}px)`, top: gallery.rightColumn.top, width: gallery.rightColumn.width, height: gallery.rightColumn.height, gap: gallery.gap }}
            >
              <GalleryCard ref={setCard(2)} photo={third} card={gallery.rightColumn.cards[0]} />
              <GalleryCard ref={setCard(3)} photo={fourth} card={gallery.rightColumn.cards[1]} />
            </div>
          </div>
        ) : null}

        {gallery?.layout === 'stacked' ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
            {[gallery.topRow, gallery.bottomRow].map((row, rowIndex) => (
              <div key={rowIndex} className="absolute flex" style={{ left: row.left, top: row.top, width: row.width, height: row.height, gap: gallery.gap }}>
                <GalleryCard ref={setCard(rowIndex * 2)} photo={rowIndex === 0 ? first : third} card={row.cards[0]} />
                <GalleryCard ref={setCard(rowIndex * 2 + 1)} photo={rowIndex === 0 ? second : fourth} card={row.cards[1]} />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
