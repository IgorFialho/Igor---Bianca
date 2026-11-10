"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Reveal } from '@/components/home/reveal';

// Seção do mural na página principal. Ao fundo, fotos aparecem em volta do título e vão crescendo e se afastando
// do centro (como se viessem na direção de quem olha) até sumir, enquanto outras surgem: o mesmo tipo de efeito
// da introdução da Cordially. As fotos são as postadas no mural; enquanto houver poucas, completa com as do casal.

type MuralSectionProps = {
  id: string;
  eyebrow: string;
  title: string;
  text: string;
  ctaLabel: string;
  /** Fotos usadas enquanto o mural ainda tem poucas postagens. */
  fallbackPhotos: string[];
  headingClassName: string;
  eyebrowClassName: string;
};

/** Quantas fotos podem estar na tela ao mesmo tempo. */
const SLOTS = 5;
/** Tempo de vida de cada foto (s) e intervalo entre o surgimento de uma e da próxima (s). */
const LIFETIME = 9;
const SPAWN_EVERY = LIFETIME / SLOTS;
/** Mínimo de fotos do mural para elas substituírem as do casal. */
const MIN_MURAL_PHOTOS = 5;

type Flyer = {
  start: number;
  angle: number;
  radius: number;
  width: number;
  photo: number;
};

const easeOut = (t: number) => 1 - Math.pow(1 - t, 2);

export function MuralSection({ id, eyebrow, title, text, ctaLabel, fallbackPhotos, headingClassName, eyebrowClassName }: MuralSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [photos, setPhotos] = useState<string[]>(fallbackPhotos);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  // Fotos do mural (imagens e capas dos vídeos), as mais recentes primeiro.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/mural', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !Array.isArray(data?.posts)) return;
        const fromMural = (data.posts as { mediaType: string; thumbUrl: string; posterUrl: string | null }[])
          .map((post) => (post.mediaType === 'video' ? post.posterUrl : post.thumbUrl))
          .filter((url): url is string => Boolean(url))
          .slice(0, 24);
        if (!fromMural.length) return;
        setPhotos(fromMural.length >= MIN_MURAL_PHOTOS ? fromMural : [...fromMural, ...fallbackPhotos]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fallbackPhotos]);

  // Pré-carrega as fotos para não "piscarem" ao surgir.
  useEffect(() => {
    photos.forEach((src) => {
      const image = new Image();
      image.src = src;
    });
  }, [photos]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const flyers: (Flyer | null)[] = Array.from({ length: SLOTS }, () => null);
    let nextPhoto = 0;
    let sector = Math.floor(Math.random() * 6);
    let frame = 0;
    let visible = false;
    let clock = 0;
    let last = 0;
    let lastSpawn = -Infinity;

    const spawn = (slot: number, now: number) => {
      const list = photosRef.current;
      if (!list.length) return;
      // Ângulos espalhados em 6 setores, alternando, para as fotos não se amontoarem num lado só.
      sector = (sector + 1 + Math.floor(Math.random() * 2) * 3) % 6;
      const mobile = section.clientWidth < 640;
      // Pula as fotos que já estão na tela, para a mesma não aparecer duas vezes ao mesmo tempo.
      const onScreen = new Set(flyers.filter(Boolean).map((flyer) => list[flyer!.photo]));
      for (let tries = 0; tries < list.length && onScreen.has(list[nextPhoto % list.length]); tries += 1) nextPhoto += 1;
      flyers[slot] = {
        start: now,
        angle: (sector + 0.15 + Math.random() * 0.7) * (Math.PI / 3),
        radius: 0.12 + Math.random() * 0.22,
        width: mobile ? 88 + Math.random() * 50 : 140 + Math.random() * 90,
        photo: nextPhoto % list.length,
      };
      nextPhoto += 1;
      const element = slotRefs.current[slot];
      const image = element?.querySelector('img');
      if (element && image) {
        image.src = list[flyers[slot]!.photo];
        element.style.width = `${flyers[slot]!.width}px`;
      }
    };

    const render = () => {
      const width = section.clientWidth;
      const height = section.clientHeight;
      flyers.forEach((flyer, slot) => {
        const element = slotRefs.current[slot];
        if (!element) return;
        if (!flyer) {
          element.style.opacity = '0';
          return;
        }
        const t = Math.min(1, (clock - flyer.start) / LIFETIME);
        // Sai de perto do centro e vai para fora, crescendo: dá a sensação de profundidade.
        const distance = flyer.radius + easeOut(t) * 0.5;
        const x = width / 2 + Math.cos(flyer.angle) * distance * (width / 2);
        const y = height / 2 + Math.sin(flyer.angle) * distance * (height / 2);
        const scale = 0.75 + t * 0.55;
        const opacity = t < 0.14 ? t / 0.14 : t > 0.78 ? Math.max(0, (1 - t) / 0.22) : 1;
        element.style.opacity = opacity.toFixed(3);
        element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
        // As mais antigas (maiores, "mais perto") ficam por cima.
        element.style.zIndex = String(1 + Math.round(t * 100));
      });
    };

    // Sem animação (preferência do sistema): fotos paradas espalhadas em volta do título.
    if (reduceMotion) {
      for (let slot = 0; slot < SLOTS; slot += 1) {
        spawn(slot, 0);
        flyers[slot]!.start = -LIFETIME * (0.25 + (slot / SLOTS) * 0.4);
      }
      render();
      return;
    }

    const tick = (timestamp: number) => {
      frame = 0;
      if (!visible) return;
      const delta = last ? Math.min(0.1, (timestamp - last) / 1000) : 0;
      last = timestamp;
      clock += delta;
      flyers.forEach((flyer, slot) => {
        if (flyer && clock - flyer.start >= LIFETIME) flyers[slot] = null;
      });
      if (clock - lastSpawn >= SPAWN_EVERY) {
        const free = flyers.findIndex((flyer) => !flyer);
        if (free >= 0) {
          spawn(free, clock);
          lastSpawn = clock;
        }
      }
      render();
      frame = window.requestAnimationFrame(tick);
    };

    // Ao entrar na tela já começa com várias fotos em momentos diferentes da animação, sem tela vazia.
    for (let slot = 0; slot < SLOTS - 2; slot += 1) {
      spawn(slot, -slot * SPAWN_EVERY - 0.4);
    }
    lastSpawn = 0;

    // Só anima enquanto a seção está visível (economiza bateria).
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !frame) {
          last = 0;
          frame = window.requestAnimationFrame(tick);
        }
      },
      { rootMargin: '120px 0px' }
    );
    observer.observe(section);
    render();

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id={id}
      className="relative flex min-h-[100svh] w-full scroll-mt-24 items-center justify-center overflow-hidden px-6 py-24 text-center md:px-12"
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {Array.from({ length: SLOTS }, (_, slot) => (
          <div
            key={slot}
            ref={(element) => {
              slotRefs.current[slot] = element;
            }}
            className="absolute left-0 top-0 aspect-[4/5] overflow-hidden opacity-0 shadow-[0_18px_40px_-24px_rgba(39,39,42,0.45)] will-change-transform"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" className="h-full w-full object-cover" draggable={false} decoding="async" />
          </div>
        ))}
        {/* Brilho creme atrás do texto: mantém a leitura mesmo com uma foto passando por baixo. */}
        <div className="absolute left-1/2 top-1/2 z-[150] h-[70%] w-[min(92vw,46rem)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(252,247,237,0.92),rgba(252,247,237,0.6)_55%,rgba(252,247,237,0))]" />
      </div>

      <div className="relative z-[200] mx-auto flex max-w-3xl flex-col items-center">
        <Reveal>
          <p className={eyebrowClassName}>{eyebrow}</p>
          <h2 className={`${headingClassName} mt-4`}>{title}</h2>
        </Reveal>
        <Reveal delay={0.14}>
          <p className="mx-auto mt-6 max-w-xl text-base text-zinc-700 md:text-lg">{text}</p>
        </Reveal>
        <Reveal delay={0.28} className="mt-8">
          <Link
            href="/mural"
            className="inline-flex items-center justify-center rounded-full bg-champagne-600 px-10 py-4 text-xs font-medium uppercase tracking-[0.2em] text-[#fff9f1] transition-transform duration-500 ease-[cubic-bezier(0.22,0.72,0.36,1)] hover:scale-[1.02] md:text-sm"
          >
            {ctaLabel}
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
