"use client";

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export type FooterPhoto = {
  src: string;
  /** Versão menor para celular (opcional). */
  mobileSrc?: string;
  /** Ponto de foco (object-position). */
  position?: string;
  /** Frase mostrada sobre esta foto. */
  quote: string;
};

type FooterCarouselProps = {
  photos: FooterPhoto[];
  /** Segundos entre uma foto e outra (mínimo 3), como na Cordially. */
  intervalSeconds?: number;
};

// Carrossel de fundo do rodapé, igual ao da Cordially: as fotos ficam empilhadas e a ativa aparece
// com um leve "zoom de saída" (1.03 → 1); troca sozinha e tem controles (setas e pontos) embaixo.
// Cada foto tem a sua frase, que troca junto com ela.
export function FooterCarousel({ photos, intervalSeconds = 8 }: FooterCarouselProps) {
  const [current, setCurrent] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const count = photos.length;
  const hasMany = count > 1;
  const active = count > 0 ? Math.min(current, count - 1) : 0;

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // Troca automática; reinicia a contagem sempre que a pessoa escolhe uma foto.
  useEffect(() => {
    if (reducedMotion || !hasMany) return;
    const timer = window.setInterval(() => setCurrent((index) => (index + 1) % count), 1000 * Math.max(3, intervalSeconds));
    return () => window.clearInterval(timer);
  }, [reducedMotion, hasMany, count, intervalSeconds, current]);

  const goTo = (index: number) => setCurrent((index + count) % count);

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 isolate">
        {photos.map((photo, index) => (
          <picture key={photo.src}>
            {photo.mobileSrc ? <source media="(max-width: 767px)" srcSet={photo.mobileSrc} /> : null}
            <img
              src={photo.src}
              alt=""
              loading={index === 0 ? 'eager' : 'lazy'}
              className={`absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-700 ease-out ${
                index === active ? 'z-[1] scale-100 opacity-90' : 'z-0 scale-[1.03] opacity-0'
              }`}
              style={{ objectPosition: photo.position }}
            />
          </picture>
        ))}
      </div>

      {/* Véu escuro para a frase em branco ler bem sobre qualquer foto */}
      <div className="absolute inset-0 bg-[rgba(17,12,9,0.52)]" />

      <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
        <AnimatePresence mode="wait">
          <motion.h2
            key={active}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.7, ease: [0.22, 0.72, 0.36, 1] }}
            className="max-w-5xl -translate-y-[5vh] font-display text-[3rem] leading-[0.92] text-white drop-shadow-lg md:text-[5rem]"
          >
            {photos[active]?.quote}
          </motion.h2>
        </AnimatePresence>
      </div>

      {hasMany ? (
        <div className="absolute bottom-12 left-1/2 z-10 flex h-10 -translate-x-1/2 items-center gap-2 rounded-full border border-white/45 bg-black/30 px-2 backdrop-blur-md md:bottom-14">
          <button
            type="button"
            aria-label="Foto anterior"
            onClick={() => goTo(active - 1)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/80"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 3L5 8l5 5" />
            </svg>
          </button>
          <div className="flex h-7 items-center gap-2 px-1">
            {photos.map((photo, index) => (
              <button
                key={photo.src}
                type="button"
                aria-label={`Mostrar foto ${index + 1}`}
                aria-current={index === active}
                onClick={() => goTo(index)}
                className={`h-2.5 rounded-full bg-white transition-[width,opacity,transform] duration-300 ${
                  index === active ? 'w-8 opacity-100' : 'w-2.5 opacity-55 hover:opacity-80'
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Próxima foto"
            onClick={() => goTo(active + 1)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/80"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 3l5 5-5 5" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}
