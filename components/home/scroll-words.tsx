"use client";

import { motion, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { useRef } from 'react';

type ScrollWordsProps = {
  text: string;
  className?: string;
};

function Word({ word, progress, range }: { word: string; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.4, 1]);
  return <motion.span style={{ opacity }}>{word}</motion.span>;
}

// Frase grande em que cada palavra acende (opacidade 0.4 → 1) conforme a pessoa rola a página.
export function ScrollWords({ text, className }: ScrollWordsProps) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.45'] });
  const words = text.split(' ');

  return (
    <p ref={ref} className={className}>
      {words.map((word, index) => (
        <span key={`${word}-${index}`}>
          <Word word={word} progress={scrollYProgress} range={[index / words.length, (index + 1) / words.length]} />
          {index < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </p>
  );
}
