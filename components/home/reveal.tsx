"use client";

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export const REVEAL_EASE = [0.22, 0.72, 0.36, 1] as const;

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Atraso em segundos, para revelar itens em sequência (0, 0.14, 0.28...). */
  delay?: number;
};

// Sobe 20px e aparece quando entra na tela, como os blocos do site da Cordially.
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.76, delay, ease: REVEAL_EASE }}
    >
      {children}
    </motion.div>
  );
}
