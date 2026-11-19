"use client";

import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Portal } from './portal';
import { Reveal } from './reveal';

/** position: ponto de foco (object-position) opcional. */
export type TimelinePhoto = { src: string; caption: string; position?: string };
export type TimelineChapter = {
  /** Ex.: "Capítulo um". */
  label: string;
  title: string;
  text: string;
  photos: TimelinePhoto[];
};

type StoryTimelineProps = {
  id: string;
  title: string;
  intro: string;
  chapters: TimelineChapter[];
  closing: string;
};

const EASE = [0.22, 1, 0.36, 1] as const;
// Inclinação das polaroids (alterna para parecer colado à mão).
const TILTS = [-3, 2.5, -1.5, 3];

/** Par de polaroids do capítulo: a segunda fica por cima, deslocada e inclinada para o outro lado. */
function ChapterPhotos({ photos, chapterIndex, align, onOpen }: { photos: TimelinePhoto[]; chapterIndex: number; align: 'left' | 'right'; onOpen: (photo: TimelinePhoto) => void }) {
  const [first, second] = photos;
  const tilt = TILTS[chapterIndex % TILTS.length];
  const polaroid = (photo: TimelinePhoto, rotate: number, className: string, delay: number) => (
    <motion.button
      type="button"
      onClick={() => onOpen(photo)}
      aria-label={`Ver foto maior: ${photo.caption}`}
      aria-haspopup="dialog"
      initial={{ opacity: 0, y: 40, rotate: rotate * 2.2, scale: 0.94 }}
      whileInView={{ opacity: 1, y: 0, rotate, scale: 1 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 0.9, delay, ease: EASE }}
      whileHover={{ y: -6, rotate: rotate * 0.4, transition: { duration: 0.3 } }}
      className={`group absolute block cursor-zoom-in rounded-[0.4rem] border border-black/10 bg-[#f8f3e8] p-[4%] pb-[14%] shadow-[0_14px_36px_rgba(47,36,27,0.22)] will-change-transform ${className}`}
    >
      <span className="relative block aspect-[4/5] w-full overflow-hidden rounded-[0.2rem] bg-black/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.src}
          alt={photo.caption}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          style={{ objectPosition: photo.position }}
        />
      </span>
      <span className="absolute bottom-[4%] left-1/2 max-w-[90%] -translate-x-1/2 truncate text-center font-display text-[clamp(0.8rem,1.6vw,1.05rem)] italic text-zinc-700">
        {photo.caption}
      </span>
    </motion.button>
  );
  return (
    <div className={`relative mx-auto aspect-[5/4.6] w-full max-w-[22rem] md:max-w-[26rem] ${align === 'left' ? 'md:mr-0' : 'md:ml-0'}`}>
      {first ? polaroid(first, tilt, 'left-0 top-0 w-[62%]', 0.05) : null}
      {second ? polaroid(second, -tilt * 0.8, 'bottom-0 right-0 z-10 w-[58%]', 0.2) : null}
    </div>
  );
}

/** Marcador do capítulo na linha: acende (dourado) quando a linha chega até ele. */
function TimelineNode({ index }: { index: number }) {
  return (
    <motion.span
      aria-hidden="true"
      initial="off"
      whileInView="on"
      // Acende quando o marcador passa do meio da tela, junto com a ponta da linha.
      viewport={{ once: true, margin: '0px 0px -50% 0px' }}
      className="relative flex h-11 w-11 items-center justify-center rounded-full"
    >
      <motion.span
        variants={{ off: { scale: 0.6, opacity: 0 }, on: { scale: 1.6, opacity: [0, 0.5, 0] } }}
        transition={{ duration: 1.1, ease: 'easeOut' }}
        className="absolute inset-0 rounded-full bg-champagne-600/30"
      />
      <motion.span
        variants={{
          off: { backgroundColor: '#fcf7ed', borderColor: 'rgba(39,39,42,0.18)', color: 'rgba(39,39,42,0.45)' },
          on: { backgroundColor: '#8a5a2b', borderColor: '#8a5a2b', color: '#fff9f1' },
        }}
        transition={{ duration: 0.5, ease: EASE }}
        className="relative flex h-11 w-11 items-center justify-center rounded-full border-2 font-display text-lg italic shadow-[0_6px_18px_rgba(138,90,43,0.18)]"
      >
        {index + 1}
      </motion.span>
    </motion.span>
  );
}

// "Nossa história": linha do tempo vertical que se preenche conforme a rolagem; cada capítulo (texto + fotos)
// entra quando a linha chega até ele. Só transformações (GPU) e animações disparadas uma vez: leve no celular.
export function StoryTimeline({ id, title, intro, chapters, closing }: StoryTimelineProps) {
  const lineRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [openPhoto, setOpenPhoto] = useState<TimelinePhoto | null>(null);

  // Progresso da linha: começa quando o topo da linha passa do meio da tela e termina quando o fim passa.
  const { scrollYProgress } = useScroll({ target: lineRef, offset: ['start 50%', 'end 50%'] });
  const smooth = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4, restDelta: 0.0005 });
  const glowTop = useTransform(smooth, (value) => `${Math.min(100, Math.max(0, value * 100))}%`);
  const glowOpacity = useTransform(smooth, [0, 0.02, 0.98, 1], [0, 1, 1, 0]);

  // Foto ampliada: trava a página e fecha com Esc.
  useEffect(() => {
    if (!openPhoto) return;
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenPhoto(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKey);
    };
  }, [openPhoto]);

  return (
    <section id={id} className="relative w-full scroll-mt-24 px-5 pb-24 pt-24 md:px-10 md:pb-32 md:pt-32">
      <header className="mx-auto max-w-3xl text-center">
        <Reveal>
          <h2 className="font-display text-[min(15vw,3.6rem)] leading-[0.95] tracking-tight text-zinc-800 md:text-[6.5rem]">{title}</h2>
        </Reveal>
        <Reveal delay={0.14}>
          <p className="mx-auto mt-6 max-w-2xl font-display text-[1.35rem] italic leading-snug text-zinc-600 md:text-[1.75rem]">{intro}</p>
        </Reveal>
      </header>

      <div ref={lineRef} className="relative mx-auto mt-16 max-w-6xl md:mt-24">
        {/* Trilho (fino) e linha dourada que cresce com a rolagem. */}
        <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-[21px] top-0 w-px bg-zinc-800/10 md:left-1/2 md:-translate-x-1/2">
          <motion.div
            className="absolute inset-0 origin-top bg-gradient-to-b from-[#c9a46a] via-champagne-600 to-[#8a5a2b] will-change-transform"
            style={{ scaleY: reduceMotion ? 1 : smooth }}
          />
          {reduceMotion ? null : (
            <motion.span
              className="absolute left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#e7c88a] shadow-[0_0_0_4px_rgba(231,200,138,0.25),0_0_18px_6px_rgba(201,164,106,0.45)]"
              style={{ top: glowTop, opacity: glowOpacity }}
            />
          )}
        </div>

        <ol className="relative space-y-20 md:space-y-28">
          {chapters.map((chapter, index) => {
            // Computador: capítulos pares com texto à esquerda e fotos à direita; ímpares ao contrário.
            const textLeft = index % 2 === 0;
            return (
              <li key={chapter.title} className="relative grid grid-cols-[44px_1fr] gap-x-5 md:grid-cols-[1fr_88px_1fr] md:gap-x-0">
                {/* Marcador na linha */}
                <div className="relative z-10 row-span-2 flex justify-center md:col-start-2 md:row-span-1 md:row-start-1 md:items-start md:pt-2">
                  <TimelineNode index={index} />
                </div>

                {/* Texto */}
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, x: 0, y: 28 }}
                  whileInView={{ opacity: 1, x: 0, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.9, ease: EASE }}
                  className={`col-start-2 pb-8 pt-1 md:row-start-1 md:pb-0 md:pt-2 ${
                    textLeft ? 'md:col-start-1 md:pr-14 md:text-right' : 'md:col-start-3 md:pl-14'
                  }`}
                >
                  <p className="text-xs font-medium uppercase tracking-[0.24em] text-champagne-700">{chapter.label}</p>
                  <h3 className="mt-3 font-display text-[2.1rem] leading-[1] text-zinc-800 md:text-[2.75rem]">{chapter.title}</h3>
                  <p className={`mt-4 max-w-md text-base leading-relaxed text-zinc-600 md:text-lg ${textLeft ? 'md:ml-auto' : ''}`}>{chapter.text}</p>
                </motion.div>

                {/* Fotos */}
                <div className={`col-start-2 md:row-start-1 ${textLeft ? 'md:col-start-3 md:pl-14' : 'md:col-start-1 md:pr-14'}`}>
                  <ChapterPhotos photos={chapter.photos} chapterIndex={index} align={textLeft ? 'right' : 'left'} onOpen={setOpenPhoto} />
                </div>
              </li>
            );
          })}
        </ol>

        {/* Fim da linha: as alianças (a linha termina nelas). */}
        <div className="relative mt-20 grid grid-cols-[44px_1fr] gap-x-5 md:mt-28 md:grid-cols-1 md:justify-items-center">
          <motion.span
            aria-hidden="true"
            initial={reduceMotion ? false : { scale: 0.5, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true, margin: '0px 0px -40% 0px' }}
            transition={{ duration: 0.7, ease: EASE }}
            className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full bg-[#8a5a2b] text-[#fff9f1] shadow-[0_0_0_6px_rgba(201,164,106,0.18),0_10px_24px_rgba(138,90,43,0.3)]"
          >
            <svg viewBox="0 0 32 24" className="h-5 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="12" cy="14" r="7" />
              <circle cx="20" cy="14" r="7" />
              <path d="M10 4.5l2 2.5 2-2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.span>
        </div>
      </div>

      {/* O próximo capítulo: logo abaixo das alianças, fora da linha. */}
      <div className="mx-auto mt-8 max-w-2xl text-center md:mt-10">
          <motion.p
            initial={reduceMotion ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.9, delay: 0.15, ease: EASE }}
            className="font-display text-[1.45rem] italic leading-snug text-zinc-700 md:text-[2rem]"
          >
            {closing}
          </motion.p>
      </div>

      {/* Foto ampliada (acima de tudo, no <body>); fecha com toque ou Esc. */}
      <Portal>
        <AnimatePresence>
          {openPhoto ? (
            <motion.div
              key={openPhoto.src}
              role="dialog"
              aria-modal="true"
              aria-label={openPhoto.caption}
              className="fixed inset-0 z-[200] flex cursor-zoom-out items-center justify-center bg-black/80 p-6 backdrop-blur-[2px]"
              onClick={() => setOpenPhoto(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Ampliada no mesmo formato da polaroid da linha do tempo (moldura creme e legenda embaixo). */}
              <motion.figure
                className="relative m-0 rounded-[0.5rem] border border-black/10 bg-[#f8f3e8] shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
                // Moldura proporcional à largura do cartão (em % ela seguiria a largura da tela).
                style={{
                  width: 'var(--card-w)',
                  padding: 'calc(var(--card-w) * 0.035) calc(var(--card-w) * 0.035) calc(var(--card-w) * 0.13)',
                  ['--card-w' as string]: 'min(88vw, 62svh, 34rem)',
                }}
                initial={{ scale: 0.85, rotate: -4, y: 30, opacity: 0 }}
                animate={{ scale: 1, rotate: -1.2, y: 0, opacity: 1 }}
                exit={{ scale: 0.9, rotate: -3, y: 20, opacity: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
              >
                <span className="relative block aspect-[4/5] w-full overflow-hidden rounded-[0.25rem] bg-black/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={openPhoto.src}
                    alt={openPhoto.caption}
                    draggable={false}
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ objectPosition: openPhoto.position }}
                  />
                </span>
                <figcaption className="absolute bottom-[3.5%] left-1/2 max-w-[90%] -translate-x-1/2 truncate text-center font-display text-[clamp(1.1rem,3.6vw,1.6rem)] italic text-zinc-700">
                  {openPhoto.caption}
                </figcaption>
              </motion.figure>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Portal>
    </section>
  );
}
