"use client";

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

export type SearchFilterOption<T extends string> = { id: T; label: string };

type SearchFieldProps<T extends string> = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  /** Menu de filtros embutido à direita do campo (opcional). */
  filter?: {
    legend: string;
    options: SearchFilterOption<T>[];
    value: T;
    /** Opção que representa "sem filtro" (não conta no contador do botão). */
    defaultValue: T;
    onChange: (value: T) => void;
  };
  /** Quantos itens aparecem com a busca/filtro atuais (texto do botão "Ver N"). */
  resultCount: number;
};

/** Mesmo campo de busca da página /presentes: lupa à esquerda e o botão "Filtros" dentro do campo, à direita. */
export function SearchField<T extends string>({ value, onChange, placeholder, label, filter, resultCount }: SearchFieldProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeFilters = filter && filter.value !== filter.defaultValue ? 1 : 0;

  // Menu de filtros fecha ao clicar fora ou com Esc.
  useEffect(() => {
    if (!isOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative">
      <div className="flex items-center rounded-xl border border-zinc-800/15 bg-cream transition-shadow focus-within:border-champagne-600 focus-within:ring-2 focus-within:ring-champagne-600/20">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="ml-5 shrink-0 text-zinc-500">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={label}
          className="w-full min-w-0 bg-transparent py-3 pl-3 pr-3 text-sm text-zinc-800 placeholder:text-zinc-500 focus:outline-none"
        />
        {filter ? (
          <>
            <span className="h-6 w-px shrink-0 bg-zinc-800/15" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setIsOpen((open) => !open)}
              aria-expanded={isOpen}
              aria-haspopup="true"
              className="flex shrink-0 items-center gap-2 rounded-r-xl py-3 pl-3 pr-5 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-800/5"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 6h16M7 12h10M10 18h4" />
              </svg>
              Filtros
              {activeFilters > 0 ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-champagne-600 px-1.5 text-[0.7rem] text-[#fff9f1]">
                  {activeFilters}
                </span>
              ) : null}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                aria-hidden="true"
                className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </>
        ) : null}
      </div>

      <AnimatePresence>
        {filter && isOpen ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 top-full z-30 mt-2 w-full max-w-xs space-y-5 rounded-3xl border border-zinc-800/10 bg-[#fffaf1] p-5 text-left shadow-[0_24px_60px_rgba(47,36,27,0.16)]"
          >
            <fieldset className="space-y-1">
              <legend className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70">{filter.legend}</legend>
              {filter.options.map((option) => {
                const selected = filter.value === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => filter.onChange(option.id)}
                    aria-pressed={selected}
                    className={`flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm transition-colors ${
                      selected ? 'bg-champagne-600/10 font-medium text-champagne-700' : 'text-zinc-800 hover:bg-zinc-800/5'
                    }`}
                  >
                    {option.label}
                    {selected ? <span aria-hidden="true">✓</span> : null}
                  </button>
                );
              })}
            </fieldset>
            <div className="flex items-center justify-between border-t border-zinc-800/10 pt-4">
              <button
                type="button"
                onClick={() => {
                  filter.onChange(filter.defaultValue);
                  onChange('');
                }}
                className="text-sm text-zinc-600 underline underline-offset-4 hover:text-zinc-800"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full bg-champagne-600 px-5 py-2 text-xs font-medium uppercase tracking-[0.16em] text-[#fff9f1]"
              >
                Ver {resultCount}
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
