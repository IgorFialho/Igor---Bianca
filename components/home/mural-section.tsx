"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Reveal } from '@/components/home/reveal';

// Seção do mural na página principal. Ao fundo, fotos aparecem em volta do título e vão crescendo e se afastando
// do centro (como se viessem na direção de quem olha) até sumir, enquanto outras surgem: o mesmo tipo de efeito
// da introdução da Cordially. As fotos são só as que estão postadas no mural (ocultas pelo admin não entram).

type MuralSectionProps = {
  id: string;
  eyebrow: string;
  title: string;
  text: string;
  ctaLabel: string;
  headingClassName: string;
  eyebrowClassName: string;
};

/** Quantas fotos podem estar na tela ao mesmo tempo. */
const SLOTS = 3;
/** Tempo de vida de cada foto (s) e intervalo entre o surgimento de uma e da próxima (s). */
const LIFETIME = 13;
const SPAWN_EVERY = LIFETIME / SLOTS;
/** De quanto em quanto tempo busca as postagens novas do mural (ms). */
const REFRESH_EVERY = 60_000;

type Flyer = {
  start: number;
  /** Posição em relação ao ponto de fuga (centro), em px, quando a foto está no tamanho "normal". */
  offsetX: number;
  offsetY: number;
  width: number;
  photo: number;
};

/** Profundidade: a foto vem de longe (pequena, perto do centro) e chega perto (grande, longe do centro). */
const DEPTH_START = 1.9;
const DEPTH_END = 0.78;

export function MuralSection({ id, eyebrow, title, text, ctaLabel, headingClassName, eyebrowClassName }: MuralSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  // Fotos postadas no mural (imagens e capas dos vídeos), as mais recentes primeiro; atualiza a cada minuto.
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch('/api/mural', { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (cancelled || !Array.isArray(data?.posts)) return;
          const urls = (data.posts as { mediaType: string; thumbUrl: string; posterUrl: string | null }[])
            .map((post) => (post.mediaType === 'video' ? post.posterUrl : post.thumbUrl))
            .filter((url): url is string => Boolean(url))
            .slice(0, 30);
          setPhotos((current) => (current.join('|') === urls.join('|') ? current : urls));
        })
        .catch(() => undefined);
    load();
    const timer = window.setInterval(load, REFRESH_EVERY);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // Pré-carrega as fotos para não "piscarem" ao surgir.
  useEffect(() => {
    photos.forEach((src) => {
      const image = new Image();
      image.src = src;
    });
  }, [photos]);

  // A animação começa quando chegam as primeiras postagens (e para se o mural ficar sem nenhuma).
  const hasPhotos = photos.length > 0;

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || !hasPhotos) return;
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
      // Todas as postagens já estão na tela (mural com poucas fotos): espera uma sair, sem repetir.
      if (onScreen.has(list[nextPhoto % list.length])) return;
      const angle = (sector + 0.15 + Math.random() * 0.7) * (Math.PI / 3);
      const reach = 0.55 + Math.random() * 0.45;
      flyers[slot] = {
        start: now,
        offsetX: Math.cos(angle) * reach * section.clientWidth * (mobile ? 0.3 : 0.32),
        offsetY: Math.sin(angle) * reach * section.clientHeight * 0.3,
        width: mobile ? 110 + Math.random() * 40 : 180 + Math.random() * 60,
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
        // Perspectiva: tudo se expande a partir do ponto de fuga no centro. A foto se aproxima em ritmo constante,
        // então cresce e se afasta do centro cada vez mais rápido, como uma foto vindo na direção de quem olha.
        const depth = DEPTH_START + (DEPTH_END - DEPTH_START) * t;
        const scale = 1 / depth;
        const x = width / 2 + flyer.offsetX * scale;
        const y = height / 2 + flyer.offsetY * scale;
        const opacity = t < 0.16 ? t / 0.16 : t > 0.8 ? Math.max(0, (1 - t) / 0.2) : 1;
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
        const flyer = flyers[slot];
        if (flyer) flyer.start = -LIFETIME * (0.25 + (slot / SLOTS) * 0.4);
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
      // Sem nenhuma foto na tela (ex.: as postagens acabaram de carregar), a próxima surge na hora.
      if (clock - lastSpawn >= SPAWN_EVERY || flyers.every((flyer) => !flyer)) {
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
    for (let slot = 0; slot < SLOTS - 1; slot += 1) {
      spawn(slot, -slot * SPAWN_EVERY - 0.6);
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
      slotRefs.current.forEach((element) => {
        if (element) element.style.opacity = '0';
      });
    };
  }, [hasPhotos]);

  return (
    <section
      ref={sectionRef}
      id={id}
      // isolate: as camadas internas (fotos e texto) ficam contidas na seção e nunca passam por cima do menu fixo.
      className="relative isolate flex min-h-[100svh] w-full scroll-mt-24 items-center justify-center overflow-hidden px-6 py-24 text-center md:px-12"
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {Array.from({ length: SLOTS }, (_, slot) => (
          <div
            key={slot}
            ref={(element) => {
              slotRefs.current[slot] = element;
            }}
            className="absolute left-0 top-0 aspect-[4/5] overflow-hidden rounded-[10px] opacity-0 shadow-[0_18px_40px_-24px_rgba(39,39,42,0.45)] will-change-transform"
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
