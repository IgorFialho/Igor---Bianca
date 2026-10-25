"use client";

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

// Emojis pensados para recados de casamento: carinho, celebração e flores. Só emojis antigos o
// bastante para aparecerem em qualquer celular ou computador (sem quadradinhos vazios).
const EMOJIS = [
  '😍', '🥰', '😊', '😄', '😂', '😭', '🤩', '😘',
  '😇', '🤗', '❤️', '💕', '💖', '💗', '💞', '💘',
  '💍', '💒', '👰', '🤵', '💌', '🥂', '🍾', '🎉',
  '🎊', '🙏', '👏', '🙌', '✨', '🌸', '🌹', '💐',
  '🌷', '🌼', '🕊️', '🎶', '💃', '🕺', '☀️', '🍀',
];

type EmojiPickerProps = {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
};

// Botão que abre um quadro de emojis; escolher um chama onSelect (o campo insere no cursor).
export function EmojiPicker({ onSelect, disabled = false }: EmojiPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!isOpen) return;
    const handlePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        aria-label="Adicionar emoji"
        aria-expanded={isOpen}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-800/15 bg-[#fffaf1] text-lg transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-champagne-600/30 disabled:opacity-50 disabled:hover:scale-100"
      >
        <span aria-hidden="true">😊</span>
      </button>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            role="dialog"
            aria-label="Escolha um emoji"
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute bottom-full right-0 z-30 mb-2 grid w-[17.5rem] grid-cols-8 gap-1 rounded-2xl border border-zinc-800/10 bg-[#fffaf1] p-2 shadow-[0_18px_40px_rgba(47,36,27,0.18)]"
          >
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onSelect(emoji)}
                aria-label={`Inserir ${emoji}`}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-xl transition-colors hover:bg-champagne-100 focus:outline-none focus-visible:bg-champagne-100"
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
