"use client";

import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Reveal } from '@/components/home/reveal';

// Seção do mural na página principal: texto e botão em cima e, embaixo, uma fileira de "pilares" com as fotos
// postadas pelo noivo e pela noiva no mural, deslizando sem parar (carrossel infinito). Os pilares alternam dois
// formatos (cantos opostos arredondados), formando uma silhueta de pétalas. Fotos de convidados não entram;
// posts ocultos pelo painel também não.

type MuralSectionProps = {
  id: string;
  eyebrow: string;
  title: string;
  text: string;
  ctaLabel: string;
  headingClassName: string;
  eyebrowClassName: string;
};

/** De quanto em quanto tempo busca as postagens novas do casal (ms). */
const REFRESH_EVERY = 60_000;
/** Tempo que cada pilar leva para atravessar a própria largura (s): define a velocidade do carrossel. */
const SECONDS_PER_PILLAR = 5.2;
/** Máximo de fotos no carrossel por visita (sorteadas entre as do casal): mantém a faixa em movimento leve. */
const MAX_PHOTOS = 16;

type CouplePost = { mediaType: string; thumbUrl: string; posterUrl: string | null; media?: { mediaType: string; thumbUrl: string; posterUrl: string | null }[] };

/**
 * Recorte vertical da foto para o pilar: troca o recorte quadrado da miniatura (c_fill … w_640,h_640, com foco
 * automático) por um alto e estreito, gerado pelo Cloudinary. Vale para fotos e capas de vídeo.
 */
function pillarUrl(thumbUrl: string) {
  return thumbUrl.replace('w_640,h_640', 'w_480,h_1200');
}

/** Cópia embaralhada (Fisher-Yates). */
function shuffle<T>(list: T[]) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Assinatura de um conjunto de fotos (independe da ordem). */
function setKey(list: string[]) {
  return [...list].sort().join('|');
}

export function MuralSection({ id, eyebrow, title, text, ctaLabel, headingClassName, eyebrowClassName }: MuralSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  // Conjunto completo das fotos do casal na última busca (para saber se mudou).
  const allKeyRef = useRef('');
  // Quantos pilares uma volta precisa para cobrir a largura da tela (com poucas fotos, elas se repetem).
  const [minPillars, setMinPillars] = useState(10);

  // Fotos do noivo e da noiva (fotos e capas de vídeo, inclusive de posts com várias mídias), mais recentes primeiro.
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch('/api/mural?limit=50&autor=casal', { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (cancelled || !Array.isArray(data?.posts)) return;
          const urls = (data.posts as CouplePost[])
            .flatMap((post) => (post.media?.length ? post.media : [post]))
            .map((item) => (item.mediaType === 'video' ? item.posterUrl : item.thumbUrl))
            .filter((url): url is string => Boolean(url))
            .map(pillarUrl);
          // Ordem aleatória (e, com muitas fotos, uma seleção de até MAX_PHOTOS) a cada visita. Na atualização de cada
          // minuto, só sorteia de novo se as fotos do casal mudaram (o carrossel não troca enquanto a pessoa olha).
          const key = setKey(urls);
          if (key === allKeyRef.current) return;
          allKeyRef.current = key;
          setPhotos(shuffle(urls).slice(0, MAX_PHOTOS));
        })
        .catch(() => undefined);
    load();
    const timer = window.setInterval(load, REFRESH_EVERY);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // Largura da tela → quantos pilares uma volta precisa.
  useEffect(() => {
    const measure = () => {
      const pillar = window.innerWidth < 640 ? 0.42 * window.innerWidth : Math.min(Math.max(148, 0.1 * window.innerWidth), 320);
      setMinPillars(Math.ceil(window.innerWidth / (pillar + 6)) + 2);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Só anima enquanto a seção está na tela (economiza bateria).
  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!section || !track) return;
    const observer = new IntersectionObserver(([entry]) => {
      track.style.animationPlayState = entry.isIntersecting ? 'running' : 'paused';
    });
    observer.observe(section);
    return () => observer.disconnect();
  }, [photos.length]);

  // Uma volta do carrossel: as fotos em ordem, repetidas até cobrir a tela.
  const sequence: string[] = [];
  if (photos.length) {
    while (sequence.length < Math.max(minPillars, photos.length)) sequence.push(photos[sequence.length % photos.length]);
  }
  const hasPhotos = sequence.length > 0;
  const trackStyle = { '--pillar-duration': `${sequence.length * SECONDS_PER_PILLAR}s` } as CSSProperties;

  return (
    <section
      ref={sectionRef}
      id={id}
      // Com o carrossel, a seção ocupa exatamente a tela (texto em cima, pilares no resto) e o menu a alinha ao topo.
      data-scroll-align={hasPhotos ? 'top' : undefined}
      className={`relative isolate flex w-full scroll-mt-24 flex-col items-center overflow-hidden text-center ${
        hasPhotos ? 'h-[100svh] min-h-[36rem] pt-24 md:pt-28' : 'min-h-[70svh] justify-center px-6 py-24'
      }`}
    >
      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-6 md:px-12">
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

      {hasPhotos ? (
        <div className="mural-pillars relative mt-10 min-h-[15rem] w-full flex-1 md:mt-12" aria-hidden="true">
          <div ref={trackRef} className="mural-pillars-track" style={trackStyle}>
            {/* Duas voltas iguais (cada uma cobre a largura da tela): a animação anda uma volta (metade) e recomeça
                sem emenda. */}
            {[0, 1].map((copy) => (
              <div key={copy} className="mural-pillars-sequence">
                {sequence.map((src, index) => (
                  <div key={`${copy}-${index}`} className="mural-pillar" data-shape={index % 2 === 0 ? 'forward' : 'reverse'}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      draggable={false}
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
