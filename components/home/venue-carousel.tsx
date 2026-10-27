"use client";

import { useEffect, useRef, useState } from 'react';

export type VenuePhoto = { src: string; alt: string; position?: string };

type VenueCarouselProps = {
  photos: VenuePhoto[];
  /** Segundos que cada foto fica na tela. */
  intervalSeconds?: number;
};

// Fotos do local trocando sozinhas: a próxima aparece por cima com um esmaecer suave (1,2s) e um
// leve zoom lento enquanto está na tela, como uma apresentação de slides.
export function VenueCarousel({ photos, intervalSeconds = 5 }: VenueCarouselProps) {
  const [active, setActive] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const count = photos.length;

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // Só troca enquanto está na tela: quem chega na seção sempre começa pela primeira foto.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setIsVisible(Boolean(entry?.isIntersecting)), { threshold: 0.3 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion || count < 2 || !isVisible) return;
    const timer = window.setInterval(() => setActive((index) => (index + 1) % count), intervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [reducedMotion, count, intervalSeconds, isVisible]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {photos.map((photo, index) => {
        const isActive = index === active;
        return (
          <img
            key={photo.src}
            src={photo.src}
            alt={isActive ? photo.alt : ''}
            aria-hidden={!isActive}
            loading={index === 0 ? 'eager' : 'lazy'}
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              objectPosition: photo.position,
              opacity: isActive ? 1 : 0,
              transform: isActive && !reducedMotion ? 'scale(1.06)' : 'scale(1)',
              // A foto que entra esmaece em 1,2s e depois aproxima devagar durante todo o tempo na tela.
              transition: `opacity 1200ms ease-in-out, transform ${isActive ? intervalSeconds * 1000 + 1200 : 1200}ms linear`,
            }}
          />
        );
      })}
    </div>
  );
}
