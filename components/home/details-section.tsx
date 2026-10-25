"use client";

import { AnimatePresence, motion } from 'framer-motion';
import { Caveat } from 'next/font/google';
import { useEffect, useRef, useState } from 'react';
import { Portal } from './portal';
import { Reveal } from './reveal';

// Letra de mão para o texto dos post-its.
const handwriting = Caveat({ subsets: ['latin'], weight: ['500', '600'] });

export type GuestMessage = {
  id: string;
  guestName: string;
  message: string;
  submittedAt: string;
};

type DetailsSectionProps = {
  id: string;
  title: string;
  subtitle: string;
  messages: GuestMessage[];
  isLoading: boolean;
  emptyMessage: string;
};

const PANEL_EASE = [0.22, 1, 0.36, 1] as const;

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR');
}

// Cores de post-it tiradas só da paleta do site (tailwind.config.ts): cremes, areias e caramelo claro.
const NOTE_COLORS = [
  '#fffaf1', // champagne-50
  '#f6edd7', // champagne-100 / parchment
  '#efdcb2', // champagne-200
  '#e7c88a', // champagne-300 (destaque claro)
  '#f8ecdc', // teaRose-100
  '#f0d9bc', // teaRose-200
  '#f4ede2', // zinc-100
];

// Sorteia a cor a partir do id da mensagem: parece aleatória, mas o mesmo recado mantém a mesma
// cor na lista, ao abrir e entre recarregamentos (e não muda entre servidor e navegador).
function noteColor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return NOTE_COLORS[hash % NOTE_COLORS.length];
}
// Inclinações variadas, como notas coladas à mão numa parede.
const NOTE_ROTATIONS = [-2.4, 1.6, -1.1, 2.2, -1.8, 1];

// Post-it com a mensagem escrita "à mão", fita adesiva no topo e o canto de baixo levantando.
function StickyNote({ entry, index, large = false }: { entry: GuestMessage; index: number; large?: boolean }) {
  return (
    <div
      className={`relative w-full ${large ? 'mx-auto max-w-xl' : 'aspect-square'}`}
      style={{ transform: `rotate(${NOTE_ROTATIONS[index % NOTE_ROTATIONS.length]}deg)` }}
    >
      {/* Sombra mais forte no canto inferior direito, como papel que descola da parede */}
      <div className="absolute bottom-1 right-2 h-1/4 w-2/3 rotate-3 rounded-full bg-[rgba(47,36,27,0.28)] blur-md" />
      <div
        className={`relative flex h-full w-full flex-col rounded-2xl transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-1 ${
          large ? 'aspect-square p-8 sm:p-12' : 'p-5 sm:p-6'
        }`}
        style={{
          backgroundColor: noteColor(entry.id),
          // Leve degradê de luz e sombra para parecer papel
          backgroundImage: 'linear-gradient(170deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 35%, rgba(0,0,0,0.04) 100%)',
          boxShadow: '0 1px 2px rgba(47,36,27,0.12), 0 8px 18px rgba(47,36,27,0.10)',
        }}
      >
        {/* Fita adesiva */}
        <span
          aria-hidden="true"
          className="absolute -top-3 left-1/2 h-7 w-24 -translate-x-1/2 rotate-[-3deg] border-x border-dashed border-white/40 bg-white/45 shadow-sm backdrop-blur-[1px]"
        />
        <p
          className={`${handwriting.className} text-zinc-800 [overflow-wrap:anywhere] ${
            large ? 'text-3xl leading-snug sm:text-4xl' : 'line-clamp-6 text-2xl leading-tight'
          }`}
        >
          {entry.message}
        </p>
        <p
          className={`${handwriting.className} mt-auto pt-3 text-right text-champagne-700 [overflow-wrap:anywhere] ${
            large ? 'text-3xl' : 'truncate text-xl'
          }`}
        >
          — {entry.guestName}
        </p>
      </div>
    </div>
  );
}

// Seção no lugar da "details" da Cordially: as mensagens que os convidados deixam ao confirmar
// presença viram post-its. Clicar abre o post-it grande numa página por cima do site.
export function DetailsSection({ id, title, subtitle, messages, isLoading, emptyMessage }: DetailsSectionProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const openIndex = openId === null ? -1 : messages.findIndex((entry) => entry.id === openId);
  const openMessage = openIndex >= 0 ? messages[openIndex] : null;
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState(false);

  // As setas só aparecem quando há mais post-its do que cabem na tela.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const update = () => setCanScroll(track.scrollWidth > track.clientWidth + 4);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(track);
    return () => observer.disconnect();
  }, [messages.length, isLoading]);

  // Recados novos entram no começo do carrossel: se a pessoa ainda está no início, volta para mostrá-los.
  const firstMessageId = messages[0]?.id;
  useEffect(() => {
    const track = trackRef.current;
    if (track && track.scrollLeft < track.clientWidth / 2) track.scrollTo({ left: 0, behavior: 'smooth' });
  }, [firstMessageId]);

  const scrollByPage = (direction: -1 | 1) => {
    const track = trackRef.current;
    const firstNote = track?.firstElementChild;
    if (!track || !firstNote) return;
    // Avança exatamente as colunas que cabem na tela (até 4), sem cortar post-its pela metade.
    const style = window.getComputedStyle(track);
    const gap = parseFloat(style.columnGap) || 0;
    const visibleWidth = track.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const columnWidth = firstNote.getBoundingClientRect().width + gap;
    const columns = Math.max(1, Math.round((visibleWidth + gap) / columnWidth));
    track.scrollBy({ left: direction * columns * columnWidth, behavior: 'smooth' });
  };

  // Enquanto a mensagem está aberta, a página de trás não rola e o Esc fecha.
  useEffect(() => {
    if (openId === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenId(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [openId]);

  return (
    <section id={id} className="relative z-20 w-full scroll-mt-24 px-6 py-20 md:px-10 md:py-28">
      <div className="mx-auto w-full max-w-[100rem]">
        <div className="mb-6 flex w-full flex-col items-center px-2 text-center">
          <Reveal className="w-full">
            <h2 className="font-display text-[3rem] leading-[0.92] text-zinc-800 md:text-[3.75rem]">{title}</h2>
          </Reveal>
          <Reveal delay={0.14}>
            <p className="mt-4 max-w-3xl text-base text-zinc-600 md:text-lg">{subtitle}</p>
          </Reveal>
        </div>

        {isLoading ? <p className="mt-12 text-center text-lg text-zinc-600">Carregando mensagens...</p> : null}
        {!isLoading && messages.length === 0 ? <p className="mt-12 text-center text-lg text-zinc-600">{emptyMessage}</p> : null}

        {!isLoading && messages.length > 0 ? (
          <Reveal delay={0.2} className="relative mx-auto mt-10 max-w-[74rem]">
            {/* Carrossel em duas linhas: as colunas crescem para a direita conforme chegam mensagens. No máximo
                4 post-its por linha ficam visíveis (3 no notebook, 2 no tablet, 1 e a ponta do próximo no celular). */}
            <div
              ref={trackRef}
              className="grid snap-x snap-mandatory scroll-px-4 auto-cols-[78%] grid-flow-col grid-rows-2 gap-x-10 gap-y-10 overflow-x-auto overscroll-x-contain px-4 py-10 [scrollbar-width:none] sm:auto-cols-[calc((100%-2.5rem)/2)] lg:auto-cols-[calc((100%-5rem)/3)] xl:auto-cols-[calc((100%-7.5rem)/4)] [&::-webkit-scrollbar]:hidden"
            >
              <AnimatePresence initial={false}>
                {messages.map((entry, index) => (
                  <motion.div
                    key={entry.id}
                    className="snap-start"
                    // Mensagens que chegam com a página aberta entram com um "pulo" suave.
                    initial={{ opacity: 0, scale: 0.6, rotate: -8 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenId(entry.id)}
                      aria-label={`Ler a mensagem de ${entry.guestName}`}
                      className="group block w-full cursor-pointer text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-champagne-600/40 focus-visible:ring-offset-4 focus-visible:ring-offset-cream"
                    >
                      <StickyNote entry={entry} index={index} />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {canScroll ? (
              <div className="mt-2 flex justify-center gap-3">
                {(['anterior', 'próxima'] as const).map((label, direction) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => scrollByPage(direction === 0 ? -1 : 1)}
                    aria-label={`Mensagens ${label === 'anterior' ? 'anteriores' : 'seguintes'}`}
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-800/15 bg-[#fffaf1] text-zinc-800 shadow-sm transition-transform hover:scale-105"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={direction === 0 ? 'M10 3L5 8l5 5' : 'M6 3l5 5-5 5'} />
                    </svg>
                  </button>
                ))}
              </div>
            ) : null}
          </Reveal>
        ) : null}
      </div>

      <Portal>
        <AnimatePresence>
          {openMessage ? (
            <motion.div
              key={openMessage.id}
              role="dialog"
              aria-modal="true"
              aria-label={`Mensagem de ${openMessage.guestName}`}
              className="fixed inset-0 z-[70] overflow-y-auto bg-cream"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.6, ease: PANEL_EASE }}
            >
              <div className="sticky top-0 z-10 flex justify-end px-4 pt-[18px] md:px-8">
                <button
                  type="button"
                  onClick={() => setOpenId(null)}
                  aria-label="Fechar"
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-800/10 bg-[#fffaf1]/90 text-zinc-800 shadow-sm backdrop-blur-md transition-transform hover:scale-105"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M3 3l10 10M13 3L3 13" />
                  </svg>
                </button>
              </div>

              <div className="mx-auto w-full max-w-4xl px-6 pb-24 pt-6 md:px-10 md:pt-10">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.76, delay: 0.25, ease: PANEL_EASE }}
                >
                  <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70">
                    Mensagem deixada em {formatDate(openMessage.submittedAt)}
                  </p>
                  <h2 className="mb-10 font-display text-[3rem] leading-[0.92] text-zinc-800 [overflow-wrap:anywhere] md:text-[4.5rem]">
                    {openMessage.guestName}
                  </h2>
                  <StickyNote entry={openMessage} index={openIndex} large />
                </motion.div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Portal>
    </section>
  );
}
