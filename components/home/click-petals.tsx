"use client";

import { useEffect, useRef } from 'react';

const COUNT = 8;
const DURATION_MS = 700;
const RADIUS = 46;
const SIZE = 11;
// Quanto as pétalas "caem" (px) até sumir, para parecerem leves.
const FALL = 18;

type Petal = { x: number; y: number; angle: number; spin: number; startTime: number };

const easeOutQuad = (t: number) => t * (2 - t);

// A cada clique em qualquer lugar da página, pétalas brancas se espalham em círculo, giram,
// caem um pouco e somem (baseado no efeito de clique da Cordially).
export function ClickPetals() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    let petals: Petal[] = [];
    let frame: number | null = null;

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(window.innerWidth * ratio);
      const height = Math.round(window.innerHeight * ratio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
      }
    };

    // Pétala: gota alongada com a ponta para fora. Branca, com contorno e sombra suaves para
    // aparecer também sobre o fundo creme.
    const drawPetal = (x: number, y: number, size: number, rotation: number) => {
      context.save();
      context.translate(x, y);
      context.rotate(rotation);
      context.beginPath();
      context.moveTo(0, -size);
      context.bezierCurveTo(0.75 * size, -0.55 * size, 0.6 * size, 0.7 * size, 0, size);
      context.bezierCurveTo(-0.6 * size, 0.7 * size, -0.75 * size, -0.55 * size, 0, -size);
      context.shadowColor = 'rgba(47, 36, 27, 0.25)';
      context.shadowBlur = 4;
      context.shadowOffsetY = 1;
      context.fillStyle = '#ffffff';
      context.fill();
      context.shadowColor = 'transparent';
      context.lineWidth = 0.75;
      context.strokeStyle = 'rgba(138, 90, 43, 0.3)';
      context.stroke();
      context.restore();
    };

    const render = (now: number) => {
      resize();
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      petals = petals.filter((petal) => {
        const elapsed = now - petal.startTime;
        if (elapsed >= DURATION_MS) return false;
        const t = elapsed / DURATION_MS;
        const distance = easeOutQuad(t) * RADIUS;
        context.globalAlpha = 1 - t;
        drawPetal(
          petal.x + distance * Math.cos(petal.angle),
          petal.y + distance * Math.sin(petal.angle) + FALL * t * t,
          SIZE * (1 - 0.4 * t),
          petal.angle + Math.PI / 2 + petal.spin * t,
        );
        context.globalAlpha = 1;
        return true;
      });
      frame = petals.length > 0 ? window.requestAnimationFrame(render) : null;
    };

    const handleClick = (event: MouseEvent) => {
      const startTime = performance.now();
      for (let index = 0; index < COUNT; index += 1) {
        petals.push({
          x: event.clientX,
          y: event.clientY,
          angle: (2 * Math.PI * index) / COUNT,
          spin: (Math.random() - 0.5) * 3,
          startTime,
        });
      }
      if (frame === null) frame = window.requestAnimationFrame(render);
    };

    resize();
    window.addEventListener('click', handleClick);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('resize', resize);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[99999] block h-screen w-screen select-none"
    />
  );
}
