"use client";

import { useEffect, useRef } from 'react';

// Mesmo efeito da seção de contagem da Cordially: na primeira vez que a seção aparece, flores
// (emojis) saem dos dois cantos de baixo da tela, sobem, caem com gravidade e somem.
const FLOWERS = ['🌸', '🌺', '🌼', '🌻', '🌷'];
const BURST = { particleCount: 60, spread: 80, startVelocity: 45, ticks: 300 };

type BurstOptions = typeof BURST & { origin: { x: number; y: number }; angle: number };

function launchBurst(layer: HTMLElement, options: BurstOptions) {
  const { width, height } = layer.getBoundingClientRect();
  if (width <= 0 || height <= 0) return Promise.resolve();

  const duration = options.ticks * (1000 / 60);
  const fragment = document.createDocumentFragment();
  const particles: { element: HTMLSpanElement; keyframes: Keyframe[] }[] = [];

  for (let index = 0; index < options.particleCount; index += 1) {
    const element = document.createElement('span');
    element.textContent = FLOWERS[index % FLOWERS.length];
    element.style.cssText =
      'position:absolute;left:0;top:0;display:block;width:1em;height:1em;font:14px/1 "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif;pointer-events:none;user-select:none;opacity:0;';
    fragment.append(element);

    // Simulação simples: velocidade inicial em leque, atrito de 10% por quadro e gravidade.
    const angle = ((-options.angle + options.spread * (Math.random() - 0.5)) * Math.PI) / 180;
    let velocity = options.startVelocity * (0.5 + Math.random());
    let x = width * options.origin.x;
    let y = height * options.origin.y;
    const rotation = 360 * Math.random();
    const spin = (Math.random() - 0.5) * 8;
    const wobble = Math.random() * Math.PI * 2;
    const keyframes: Keyframe[] = [];

    for (let tick = 0; tick <= options.ticks; tick += 1) {
      if (tick % 3 === 0 || tick === options.ticks) {
        const t = tick / options.ticks;
        keyframes.push({
          offset: t,
          transform: `translate(${(x - 7).toFixed(2)}px, ${(y - 7).toFixed(2)}px) rotate(${(rotation + spin * tick).toFixed(2)}deg) scaleX(${(0.6 + 0.4 * Math.cos(wobble + 0.1 * tick)).toFixed(3)})`,
          opacity: 1 - t,
        });
      }
      x += Math.cos(angle) * velocity;
      y += Math.sin(angle) * velocity + 3;
      velocity *= 0.9;
    }

    particles.push({ element, keyframes });
  }

  layer.append(fragment);
  const animations = particles.map(({ element, keyframes }) =>
    element.animate(keyframes, { duration, easing: 'linear', fill: 'both' }),
  );

  return Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(() => {
    particles.forEach(({ element }) => element.remove());
  });
}

export function FlowerConfetti({ targetId }: { targetId: string }) {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const target = document.getElementById(targetId);
    if (!layer || !target) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof layer.animate !== 'function') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        void launchBurst(layer, { ...BURST, origin: { x: 0, y: 1 }, angle: 60 });
        void launchBurst(layer, { ...BURST, origin: { x: 1, y: 1 }, angle: 120 });
      },
      { threshold: 0.05 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  return (
    <div
      ref={layerRef}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[100] h-[100dvh] w-full overflow-hidden"
    />
  );
}
