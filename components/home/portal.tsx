"use client";

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Renderiza no <body>, fora das camadas (z-index) das seções, para que telas sobrepostas
// fiquem por cima do menu fixo e do player.
export function Portal({ children }: { children: ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => setIsMounted(true), []);

  return isMounted ? createPortal(children, document.body) : null;
}
