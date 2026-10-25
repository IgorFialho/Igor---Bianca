"use client";

import { useState } from 'react';
import { Reveal } from './reveal';

export type FaqItem = { question: string; answer: string };

type FaqSectionProps = {
  id: string;
  title: string;
  intro?: string;
  items: FaqItem[];
};

// Perguntas e respostas em sanfona: título fixo à esquerda (no computador) e lista à direita.
export function FaqSection({ id, title, intro, items }: FaqSectionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id={id} className="relative w-full scroll-mt-24 px-6 py-20 md:px-10 md:py-28">
      <div className="mx-auto flex max-w-6xl flex-col gap-16 lg:flex-row lg:gap-24">
        <div className="relative flex flex-col lg:w-1/3">
          <Reveal className="lg:sticky lg:top-32">
            <h2 className="mb-6 font-display text-5xl leading-[1.1] tracking-tight text-zinc-800 md:text-6xl lg:text-7xl">{title}</h2>
            {intro ? <p className="text-lg text-zinc-600 md:text-xl">{intro}</p> : null}
          </Reveal>
        </div>

        <Reveal delay={0.14} className="w-full lg:w-2/3">
          <div className="border-t border-zinc-800/20">
            {items.map((item, index) => {
              const isOpen = openIndex === index;
              const answerId = `${id}-resposta-${index}`;
              return (
                <div key={item.question} className="border-b border-zinc-800/20">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={answerId}
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="group flex w-full items-start justify-between py-6 text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-champagne-600/30"
                  >
                    <span className="pe-8 text-lg font-medium text-zinc-800 transition-opacity group-hover:opacity-80 md:text-xl">
                      {item.question}
                    </span>
                    <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-zinc-800/10 text-zinc-800">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                        <path d="M2 6h8" />
                        <path d="M6 2v8" className={`origin-center transition-transform duration-300 ${isOpen ? 'scale-y-0' : 'scale-y-100'}`} />
                      </svg>
                    </span>
                  </button>
                  <div
                    id={answerId}
                    className="grid transition-[grid-template-rows,opacity] duration-300 ease-in-out"
                    style={{ gridTemplateRows: isOpen ? '1fr' : '0fr', opacity: isOpen ? 1 : 0 }}
                  >
                    <div className="overflow-hidden">
                      <div className="space-y-4 pb-6 pe-4 text-base leading-relaxed text-zinc-600 md:pe-12 md:text-lg">
                        {item.answer.split('\n\n').map((paragraph) => (
                          <p key={paragraph} className="whitespace-pre-line">
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
