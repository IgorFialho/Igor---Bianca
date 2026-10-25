"use client";

import { AnimatePresence, motion, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Portal } from './portal';
import { Reveal } from './reveal';

/** position: ponto de foco (object-position) para os rostos não serem cortados. */
export type StoryPhoto = { src: string; caption: string; position?: string };
export type StoryChapter = { title: string; text: string; photos: StoryPhoto[] };

type StoryScrollProps = {
  id: string;
  title: string;
  chapters: StoryChapter[];
};

// Inclinação de cada polaroid dentro do capítulo, como na Cordially.
const ROTATIONS = [-2.5, 1.8, -1.2];

function chapterRange(index: number, total: number): [number, number] {
  return [index / total, (index + 1) / total];
}

function ChapterText({
  chapter,
  index,
  total,
  progress,
  align,
}: {
  chapter: StoryChapter;
  index: number;
  total: number;
  progress: MotionValue<number>;
  align: 'left' | 'right' | 'center';
}) {
  const [start, end] = chapterRange(index, total);
  const fade = 0.03;
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const opacity = useTransform(
    progress,
    [start, start + fade, end - fade, end],
    [isFirst ? 1 : 0, 1, 1, isLast ? 1 : 0],
  );

  return (
    <motion.div style={{ opacity }} className={align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'}>
      <h3 className="mb-2 font-display text-[clamp(1.25rem,5vw,1.5rem)] leading-tight text-zinc-800 md:text-3xl">{chapter.title}</h3>
      <p className="mx-auto max-w-[42rem] text-[clamp(0.9rem,3.6vw,1rem)] leading-[1.38] text-zinc-600 md:text-lg">{chapter.text}</p>
    </motion.div>
  );
}

function Polaroid({
  photo,
  rotation,
  zIndex,
  progress,
  range,
  isInitial,
  onOpen,
}: {
  photo: StoryPhoto;
  rotation: number;
  zIndex: number;
  progress: MotionValue<number>;
  range: [number, number];
  isInitial: boolean;
  onOpen: () => void;
}) {
  // Cada foto sobe de fora da tela e cai sobre a pilha; a primeira já começa no lugar.
  const y = useTransform(progress, range, [isInitial ? '0vh' : '110vh', '0vh']);

  return (
    <motion.div className="absolute inset-0" style={{ y, zIndex }}>
      <div className="h-full w-full transition-transform duration-300 ease-out md:hover:-translate-y-4 md:hover:scale-[1.03]">
        <div
          className="relative h-full w-full rounded-[0.45rem] border border-black/10 bg-[#f8f3e8] p-[4.5%] pb-[18%] shadow-[0_14px_42px_rgba(0,0,0,0.32)]"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Ampliar foto: ${photo.caption}`}
            className="relative block h-full w-full cursor-zoom-in overflow-hidden rounded-[0.2rem] bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-champagne-600/50"
          >
            <img src={photo.src} alt={photo.caption} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: photo.position }} />
          </button>
          <p className="absolute bottom-[7%] left-1/2 max-w-[90%] -translate-x-1/2 truncate text-center text-[clamp(0.7rem,1.8vw,1rem)] text-black/70">
            {photo.caption}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// "Nossa história": a seção fica presa na tela enquanto a rolagem empilha as polaroids
// de cada capítulo e troca o texto ao lado (alternando esquerda e direita).
export function StoryScroll({ id, title, chapters }: StoryScrollProps) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const [openPhoto, setOpenPhoto] = useState<StoryPhoto | null>(null);
  const total = chapters.length;
  const photos = chapters.flatMap((chapter, chapterIndex) =>
    chapter.photos.map((photo, photoIndex) => ({ photo, chapterIndex, photoIndex })),
  );

  useEffect(() => {
    if (!openPhoto) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenPhoto(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [openPhoto]);

  return (
    <section id={id} ref={ref} className="relative w-full scroll-mt-0" style={{ height: `${total * 160}vh` }}>
      <div className="sticky top-0 flex h-[100svh] w-full flex-col items-center overflow-hidden px-4 pt-24 md:pt-28">
        <Reveal className="w-full">
          <h2 className="whitespace-nowrap text-center font-display text-[min(14vw,3.3rem)] leading-none tracking-tight text-zinc-800 md:text-[min(14vw,11.2rem)]">
            {title}
          </h2>
        </Reveal>

        <div className="relative mt-6 grid w-full max-w-[1400px] flex-1 grid-rows-[auto_1fr] items-center gap-6 md:mt-10 md:grid-cols-[1fr_auto_1fr] md:grid-rows-1 md:gap-8 md:px-8">
          {/* Texto do capítulo: no celular fica acima das fotos; no computador alterna os lados. */}
          <div className="relative min-h-[7rem] md:hidden">
            {chapters.map((chapter, index) => (
              <div key={chapter.title} className="absolute inset-0">
                <ChapterText chapter={chapter} index={index} total={total} progress={scrollYProgress} align="center" />
              </div>
            ))}
          </div>
          <div className="relative hidden h-full md:block">
            {chapters.map((chapter, index) =>
              index % 2 === 0 ? (
                <div key={chapter.title} className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-4">
                  <ChapterText chapter={chapter} index={index} total={total} progress={scrollYProgress} align="right" />
                </div>
              ) : null,
            )}
          </div>

          <div className="relative mx-auto aspect-[4/3] w-[min(78vw,430px)] self-start md:self-center">
            {photos.map(({ photo, chapterIndex, photoIndex }, index) => {
              const [start, end] = chapterRange(chapterIndex, total);
              const step = (end - start) / Math.max(1, chapters[chapterIndex].photos.length);
              const enterStart = start + step * photoIndex;
              return (
                <Polaroid
                  key={`${photo.src}-${index}`}
                  photo={photo}
                  rotation={ROTATIONS[photoIndex % ROTATIONS.length]}
                  zIndex={index + 1}
                  progress={scrollYProgress}
                  range={[enterStart, enterStart + step * 0.7]}
                  isInitial={index === 0}
                  onOpen={() => setOpenPhoto(photo)}
                />
              );
            })}
          </div>

          <div className="relative hidden h-full md:block">
            {chapters.map((chapter, index) =>
              index % 2 === 1 ? (
                <div key={chapter.title} className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-4">
                  <ChapterText chapter={chapter} index={index} total={total} progress={scrollYProgress} align="left" />
                </div>
              ) : null,
            )}
          </div>
        </div>
      </div>

      {/* Foto ampliada ao clicar numa polaroid; fecha com clique ou Esc. */}
      <Portal>
        <AnimatePresence>
          {openPhoto ? (
            <motion.div
              key={openPhoto.src + openPhoto.caption}
              role="dialog"
              aria-modal="true"
              aria-label={openPhoto.caption}
              className="fixed inset-0 z-[70] flex cursor-zoom-out flex-col items-center justify-center gap-4 bg-black/85 p-6"
              onClick={() => setOpenPhoto(null)}
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
