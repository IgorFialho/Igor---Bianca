"use client";

import { useEffect, useState } from 'react';

export type SectionBackground = { id: string; color: string };

// Igual à Cordially: a cor de fundo da página é a da última seção (na ordem da lista) cujo topo
// já passou de 60% da altura da tela. Use com `transition: background-color 0.5s ease`.
export function useSectionBackground(sections: SectionBackground[], defaultColor: string) {
  const [color, setColor] = useState(defaultColor);
  const key = sections.map((section) => `${section.id}:${section.color}`).join('|');

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const threshold = 0.6 * window.innerHeight;
      let next = defaultColor;
      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (element && element.getBoundingClientRect().top <= threshold) next = section.color;
      }
      setColor(next);
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
    // `key` resume a lista de seções; evita recriar o efeito a cada render.
  }, [key, defaultColor]);

  return color;
}
