"use client";

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Portal } from '@/components/home/portal';
import { Reveal } from '@/components/home/reveal';
import { SiteHeader } from '@/components/home/site-header';
import { INTRO_HOME_HREF } from '@/components/intro-arco';
import { INVITE_ACCESS_KEY } from '@/lib/invite';
import type { PublicGift } from '@/lib/gifts';

const THANK_YOU_PHOTO = '/imagens/casal/casal-08.jpeg';
const GUEST_NAME_KEY = 'igor-bianca-gift-guest-name';

// Mesmo menu da home, sem "Lista de presentes" (já estamos nela); as seções ficam lá, então os links apontam para /login#secao.
const NAV_LINKS = [
  { label: 'Início', href: INTRO_HOME_HREF },
  { label: 'Nossa história', href: '/login#nossa-historia' },
  { label: 'Cerimônia', href: '/login#cerimonia' },
  { label: 'Confirmar presença', href: '/login#rsvp' },
  { label: 'Mensagens', href: '/login#mensagens' },
  { label: 'Perguntas', href: '/login#perguntas' },
];
const PANEL_EASE = [0.22, 1, 0.36, 1] as const;

const EYEBROW = 'text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70';
const PRIMARY =
  'inline-flex items-center justify-center rounded-full bg-champagne-600 px-8 py-3.5 text-xs font-medium uppercase tracking-[0.2em] text-[#fff9f1] transition-transform duration-500 ease-[cubic-bezier(0.22,0.72,0.36,1)] hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100';
const SECONDARY =
  'inline-flex items-center justify-center rounded-full border border-zinc-800/20 px-6 py-3 text-xs font-medium uppercase tracking-[0.16em] text-zinc-800 transition-colors hover:bg-zinc-800/5';
const FIELD =
  'w-full rounded-3xl border border-zinc-800/15 bg-cream px-5 py-3 text-sm text-zinc-800 placeholder:text-zinc-500 focus:border-champagne-600 focus:outline-none focus:ring-2 focus:ring-champagne-600/20';

type Step = 'choose' | 'pix' | 'store' | 'thanks';
type SortMode = 'random' | 'price-asc' | 'price-desc';

// Faixas de preço do filtro (em centavos; max exclusivo).
const PRICE_RANGES = [
  { id: 'all', label: 'Todos os valores', min: 0, max: Infinity },
  { id: 'ate-100', label: 'Até R$ 100', min: 0, max: 100_01 },
  { id: '100-300', label: 'R$ 100 a 300', min: 100_01, max: 300_01 },
  { id: '300-600', label: 'R$ 300 a 600', min: 300_01, max: 600_01 },
  { id: 'acima-600', label: 'Acima de R$ 600', min: 600_01, max: Infinity },
] as const;
type PriceRangeId = (typeof PRICE_RANGES)[number]['id'];

/** Busca sem diferenciar maiúsculas nem acentos ("cafe" encontra "Café"). */
function normalize(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: 'random', label: 'Ordem aleat\u00f3ria' },
  { id: 'price-asc', label: 'Menor pre\u00e7o' },
  { id: 'price-desc', label: 'Maior pre\u00e7o' },
];

/** Op\u00e7\u00e3o do menu de filtros: marca \u00e0 direita quando escolhida. */
function FilterOption({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm transition-colors ${
        selected ? 'bg-champagne-600/10 font-medium text-champagne-700' : 'text-zinc-800 hover:bg-zinc-800/5'
      }`}
    >
      {children}
      {selected ? <span aria-hidden="true">✓</span> : null}
    </button>
  );
}

type PixData = { payload: string; qrSvg: string; receiverName: string };

function formatPrice(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function GiftImage({ gift }: { gift: PublicGift }) {
  return gift.imageUrl ? (
    <img src={gift.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105" />
  ) : (
    <div className="absolute inset-0 flex items-center justify-center bg-[#f6edd7] text-5xl transition-transform duration-700 ease-out group-hover:scale-110" aria-hidden="true">
      🎁
    </div>
  );
}

export function GiftRegistry() {
  // Código do convite é opcional (vem do site, se a pessoa entrou por ele); o nome é obrigatório.
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [gifts, setGifts] = useState<PublicGift[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // Ordem aleatória sorteada uma vez por visita: recarregar a lista (ex.: depois de presentear) não embaralha de novo.
  const randomRank = useRef(new Map<string, number>());
  const [search, setSearch] = useState('');
  const [priceRange, setPriceRange] = useState<PriceRangeId>('all');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('random');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  // Menu de filtros fecha ao clicar fora ou com Esc.
  useEffect(() => {
    if (!filtersOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!filterMenuRef.current?.contains(event.target as Node)) setFiltersOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFiltersOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [filtersOpen]);

  const [selected, setSelected] = useState<PublicGift | null>(null);
  const [step, setStep] = useState<Step>('choose');
  const [pix, setPix] = useState<PixData | null>(null);
  const [pixError, setPixError] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    setInviteCode(window.sessionStorage.getItem(INVITE_ACCESS_KEY));
    // Lembra o nome de quem já presenteou neste navegador, para não precisar digitar de novo.
    try {
      setGuestName(window.localStorage.getItem(GUEST_NAME_KEY) ?? '');
    } catch {
      // Sem acesso ao armazenamento do navegador: a pessoa digita o nome normalmente.
    }
  }, []);

  const loadGifts = useCallback(async () => {
    try {
      const response = await fetch('/api/gifts', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Erro ao carregar a lista.');
      const list: PublicGift[] = data.gifts ?? [];
      list.forEach((gift) => {
        if (!randomRank.current.has(gift.id)) randomRank.current.set(gift.id, Math.random());
      });
      setGifts(list);
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Erro ao carregar a lista.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGifts();
  }, [loadGifts]);

  // Janela aberta: trava a página de trás e fecha com Esc.
  useEffect(() => {
    if (!selected) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [selected]);

  const openGift = (gift: PublicGift) => {
    setSelected(gift);
    setStep('choose');
    setPix(null);
    setPixError('');
    setCopied(false);
    setSubmitError('');
  };

  const goToPix = async () => {
    if (!selected) return;
    setStep('pix');
    if (pix) return;
    try {
      const response = await fetch(`/api/gifts/pix?gift=${selected.id}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Erro ao gerar o Pix.');
      setPix(data);
    } catch (error) {
      setPixError(error instanceof Error ? error.message : 'Erro ao gerar o Pix.');
    }
  };

  const copyPix = async () => {
    if (!pix) return;
    try {
      await navigator.clipboard.writeText(pix.payload);
    } catch {
      // Sem permissão de área de transferência (navegadores antigos/embutidos): copia por um campo invisível temporário.
      const field = document.createElement('textarea');
      field.value = pix.payload;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  const confirmGift = async (method: 'pix' | 'store') => {
    if (!selected) return;
    const name = guestName.trim();
    if (name.length < 2) {
      setSubmitError('Informe seu nome para os noivos saberem quem presenteou.');
      return;
    }
    try {
      window.localStorage.setItem(GUEST_NAME_KEY, name);
    } catch {
      // Ignora: lembrar o nome é só uma conveniência.
    }
    setIsSubmitting(true);
    setSubmitError('');
    try {
      const response = await fetch('/api/gifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftId: selected.id, inviteCode, guestName: name, method }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Erro ao registrar o presente.');
      setStep('thanks');
      void loadGifts();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Erro ao registrar o presente.');
      void loadGifts();
    } finally {
      setIsSubmitting(false);
    }
  };

  const visibleGifts = useMemo(() => {
    const query = normalize(search.trim());
    const range = PRICE_RANGES.find((item) => item.id === priceRange) ?? PRICE_RANGES[0];
    const rank = (gift: PublicGift) => randomRank.current.get(gift.id) ?? 0;
    return gifts
      .filter((gift) => !query || normalize(`${gift.title} ${gift.description ?? ''}`).includes(query))
      .filter((gift) => gift.priceCents >= range.min && gift.priceCents < range.max)
      .filter((gift) => !onlyAvailable || gift.status === 'available')
      .sort((a, b) => {
        // Já presenteados sempre no fim; entre os demais, a ordem escolhida.
        const taken = Number(a.status !== 'available') - Number(b.status !== 'available');
        if (taken) return taken;
        if (sortMode === 'price-asc') return a.priceCents - b.priceCents;
        if (sortMode === 'price-desc') return b.priceCents - a.priceCents;
        return rank(a) - rank(b);
      });
  }, [gifts, search, priceRange, onlyAvailable, sortMode]);

  // Quantos filtros do menu estão ativos (aparece no botão "Filtros").
  const activeFilters = Number(priceRange !== 'all') + Number(onlyAvailable) + Number(sortMode !== 'random');
  const clearFilters = () => {
    setSearch('');
    setPriceRange('all');
    setOnlyAvailable(false);
    setSortMode('random');
  };

  return (
    <main className="relative min-h-screen bg-cream px-6 pb-24 pt-8 text-zinc-800 md:px-10">
      <SiteHeader ctaLabel="Confirmar presença" ctaHref="/login#rsvp" links={NAV_LINKS} alwaysDark />

      <header className="mx-auto mt-16 max-w-3xl text-center md:mt-20">
        <Reveal>
          <p className={EYEBROW}>Lista de presentes</p>
          <h1 className="mt-4 font-display text-[3rem] leading-[0.92] md:text-[4.5rem]">Cada presente é um pedacinho do nosso sonho</h1>
        </Reveal>
        <Reveal delay={0.14}>
          <p className="mx-auto mt-6 max-w-2xl text-base text-zinc-600 md:text-lg">
            Para nos presentear, escolha um item abaixo: você pode
            enviar o valor por Pix ou comprar na loja indicada.
          </p>
        </Reveal>
      </header>

      <section aria-label="Presentes" className="mx-auto mt-14 w-full max-w-6xl">
        {!isLoading && !loadError && gifts.length > 0 ? (
          <div className="mb-10 space-y-4">
            {/* Campo de busca com o menu de filtros embutido à direita. */}
            <div ref={filterMenuRef} className="relative">
              <div className="flex items-center rounded-full border border-zinc-800/15 bg-cream transition-shadow focus-within:border-champagne-600 focus-within:ring-2 focus-within:ring-champagne-600/20">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="ml-5 shrink-0 text-zinc-500">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar presente"
                  aria-label="Buscar presente"
                  className="w-full min-w-0 bg-transparent py-3 pl-3 pr-3 text-sm text-zinc-800 placeholder:text-zinc-500 focus:outline-none"
                />
                <span className="h-6 w-px shrink-0 bg-zinc-800/15" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => setFiltersOpen((value) => !value)}
                  aria-expanded={filtersOpen}
                  aria-haspopup="true"
                  className="flex shrink-0 items-center gap-2 rounded-r-full py-3 pl-3 pr-5 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-800/5"
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
                    className={`transition-transform ${filtersOpen ? 'rotate-180' : ''}`}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              </div>

              <AnimatePresence>
                {filtersOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="absolute right-0 top-full z-30 mt-2 w-full max-w-xs space-y-5 rounded-3xl border border-zinc-800/10 bg-[#fffaf1] p-5 text-left shadow-[0_24px_60px_rgba(47,36,27,0.16)]"
                  >
                    <fieldset className="space-y-1">
                      <legend className={`${EYEBROW} mb-2`}>Ordenar</legend>
                      {SORT_OPTIONS.map((option) => (
                        <FilterOption key={option.id} selected={sortMode === option.id} onClick={() => setSortMode(option.id)}>
                          {option.label}
                        </FilterOption>
                      ))}
                    </fieldset>
                    <fieldset className="space-y-1">
                      <legend className={`${EYEBROW} mb-2`}>Valor</legend>
                      {PRICE_RANGES.map((range) => (
                        <FilterOption key={range.id} selected={priceRange === range.id} onClick={() => setPriceRange(range.id)}>
                          {range.label}
                        </FilterOption>
                      ))}
                    </fieldset>
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-800/5">
                      Só disponíveis
                      <input
                        type="checkbox"
                        checked={onlyAvailable}
                        onChange={(event) => setOnlyAvailable(event.target.checked)}
                        className="h-4 w-4 accent-champagne-600"
                      />
                    </label>
                    <div className="flex items-center justify-between border-t border-zinc-800/10 pt-4">
                      <button type="button" onClick={clearFilters} className="text-sm text-zinc-600 underline underline-offset-4 hover:text-zinc-800">
                        Limpar
                      </button>
                      <button type="button" onClick={() => setFiltersOpen(false)} className="rounded-full bg-champagne-600 px-5 py-2 text-xs font-medium uppercase tracking-[0.16em] text-[#fff9f1]">
                        Ver {visibleGifts.length}
                      </button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        ) : null}
        {isLoading ? <p className="text-center text-zinc-600">Carregando presentes…</p> : null}
        {loadError ? <p className="text-center text-rose-700">{loadError}</p> : null}
        {!isLoading && !loadError && gifts.length === 0 ? (
          <p className="text-center text-zinc-600">A lista de presentes será publicada em breve.</p>
        ) : null}

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {visibleGifts.map((gift, index) => {
            const isTaken = gift.status !== 'available';
            return (
              <Reveal key={gift.id} delay={(index % 3) * 0.1}>
                <article
                  // Card inteiro clicável nos disponíveis (abre o presente com foto e descrição).
                  onClick={isTaken ? undefined : () => openGift(gift)}
                  // Hover só nos disponíveis: o card sobe um pouco, a sombra cresce e a foto aproxima devagar.
                  // will-change deixa a camada pronta desde o início: o Safari não pisca cantos quadrados ao começar o hover.
                  className={`flex h-full flex-col overflow-hidden rounded-[2rem] will-change-transform [backface-visibility:hidden] border border-zinc-800/10 bg-[#fffaf1] shadow-[0_24px_60px_rgba(47,36,27,0.08)] transition-[opacity,transform,box-shadow] duration-500 ease-[cubic-bezier(0.22,0.72,0.36,1)] ${
                    isTaken ? 'opacity-60' : 'group cursor-pointer hover:-translate-y-2 hover:shadow-[0_32px_70px_rgba(47,36,27,0.16)]'
                  }`}
                >
                  {/* A foto se recorta sozinha (cantos de cima arredondados + máscara): no Safari, a foto aumentando no hover
                      escapava do recorte do card por alguns milissegundos e mostrava quinas quadradas escuras. */}
                  <div className="relative isolate aspect-[4/3] w-full overflow-hidden rounded-t-[calc(2rem-1px)] [-webkit-mask-image:-webkit-radial-gradient(white,black)]">
                    <GiftImage gift={gift} />
                    {isTaken ? (
                      <span className="absolute left-4 top-4 rounded-full bg-[#fffaf1]/95 px-3 py-1 text-xs font-medium text-zinc-800 shadow-sm">
                        Presenteado 💕
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <h2 className="font-display text-3xl leading-tight">{gift.title}</h2>
                    {gift.description ? <p className="mt-2 text-sm text-zinc-600">{gift.description}</p> : null}
                    <p className={`${EYEBROW} mt-4`}>{formatPrice(gift.priceCents)}</p>
                    <div className="mt-auto pt-6">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openGift(gift);
                        }}
                        disabled={isTaken}
                        className={`${PRIMARY} w-full`}
                      >
                        {isTaken ? 'Indisponível' : 'Presentear'}
                      </button>
                    </div>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
        {gifts.length > 0 && visibleGifts.length === 0 ? (
          <p className="py-10 text-center text-zinc-600">
            Nenhum presente encontrado.{' '}
            <button type="button" onClick={clearFilters} className="underline underline-offset-4 hover:text-zinc-800">
              Limpar filtros
            </button>
          </p>
        ) : null}
      </section>

      <Portal>
        <AnimatePresence>
          {selected ? (
            <motion.div
              key="gift-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={`Presentear: ${selected.title}`}
              className="fixed inset-0 z-[200] flex items-end justify-center bg-zinc-950/45 backdrop-blur-sm sm:items-center sm:p-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
            >
              <motion.div
                className={`relative max-h-[92svh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-[#fffaf1] text-center shadow-2xl transition-[max-width] duration-300 sm:rounded-[2rem] ${
                  // Na escolha, sem espaçamento interno: a foto vai até as bordas (o texto tem o próprio espaçamento).
                  // No celular a folha começa mais alta (pelo menos 82% da tela) e cresce com descrições longas (até 92%, depois rola).
                  step === 'choose' ? 'flex min-h-[82svh] flex-col md:block md:min-h-0 md:max-w-4xl md:overflow-hidden' : 'p-6 sm:p-8'
                }`}
                initial={{ y: 40 }}
                animate={{ y: 0 }}
                exit={{ y: 40 }}
                transition={{ duration: 0.45, ease: PANEL_EASE }}
                onClick={(event) => event.stopPropagation()}
              >
                {/* Na etapa de escolha, o botão fica por cima da foto, no canto, para ela ir de ponta a ponta. */}
                <div className={`flex justify-end ${step === 'choose' ? 'absolute right-4 top-4 z-10 md:right-6 md:top-6' : ''}`}>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    aria-label="Fechar"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800/10 bg-[#fffaf1]/90 text-zinc-800 backdrop-blur-sm hover:bg-[#fffaf1]"
                  >
                    ✕
                  </button>
                </div>

                {step === 'thanks' ? (
                  <div className="space-y-5 pb-2">
                    <div className="relative mx-auto aspect-[4/3] w-full overflow-hidden rounded-2xl">
                      <img src={THANK_YOU_PHOTO} alt="Igor e Bianca" className="absolute inset-0 h-full w-full object-cover" />
                    </div>
                    <h2 className="font-display text-4xl italic leading-none">Muito obrigado!</h2>
                    <p className="text-zinc-600">
                      Ficamos muito felizes com o seu carinho. Assim que confirmarmos, o presente aparece como
                      presenteado na lista.
                    </p>
                    <button type="button" onClick={() => setSelected(null)} className={`${PRIMARY} w-full`}>
                      Voltar à lista
                    </button>
                  </div>
                ) : (
                  <div className={step === 'choose' ? 'flex flex-1 flex-col md:grid md:min-h-[30rem] md:grid-cols-2 md:items-stretch' : ''}>
                    {step === 'choose' ? (
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#f6edd7] md:aspect-auto md:h-full">
                        <GiftImage gift={selected} />
                      </div>
                    ) : null}
                  <div className={`space-y-6 ${step === 'choose' ? 'flex flex-1 flex-col justify-center p-6 sm:p-8 md:p-10 md:text-left' : ''}`}>
                    <div>
                      <p className={EYEBROW}>Presentear</p>
                      <h2 className="mt-2 font-display text-4xl leading-tight">{selected.title}</h2>
                      <p className="mt-2 text-2xl text-champagne-700">{formatPrice(selected.priceCents)}</p>
                      {step === 'choose' && selected.description ? (
                        <p className="mx-auto mt-4 max-w-md whitespace-pre-line text-base leading-relaxed text-zinc-600 md:mx-0">
                          {selected.description}
                        </p>
                      ) : null}
                    </div>

                    {step === 'choose' ? (
                      <div className="flex flex-col gap-3">
                        <button type="button" onClick={goToPix} className={`${PRIMARY} w-full`}>
                          Enviar o valor por Pix
                        </button>
                        {selected.storeUrl ? (
                          <button type="button" onClick={() => setStep('store')} className={`${SECONDARY} w-full`}>
                            Comprar na loja
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {step === 'pix' ? (
                      <div className="space-y-5">
                        {pixError ? <p className="text-sm text-rose-700">{pixError}</p> : null}
                        {!pix && !pixError ? <p className="text-zinc-600">Gerando o Pix…</p> : null}
                        {pix ? (
                          <>
                            <div
                              className="mx-auto w-52 overflow-hidden rounded-2xl border border-zinc-800/10 [&_svg]:h-auto [&_svg]:w-full"
                              aria-label="QR Code do Pix"
                              role="img"
                              // SVG gerado no nosso servidor pela biblioteca qrcode.
                              dangerouslySetInnerHTML={{ __html: pix.qrSvg }}
                            />
                            <div className="space-y-2">
                              <button type="button" onClick={copyPix} className={`${SECONDARY} w-full`}>
                                {copied ? 'Código copiado ✓' : 'Copiar código Pix'}
                              </button>
                              <p className="text-xs text-zinc-500">
                                Cole no app do seu banco em &quot;Pix copia e cola&quot;. Recebedor: {pix.receiverName}. O valor já vem preenchido.
                              </p>
                            </div>
                            <div className="space-y-2 text-left">
                              <label htmlFor="gift-guest-name" className={EYEBROW}>
                                Seu nome
                              </label>
                              <input
                                id="gift-guest-name"
                                value={guestName}
                                onChange={(event) => {
                                  setGuestName(event.target.value);
                                  setSubmitError('');
                                }}
                                maxLength={150}
                                autoComplete="name"
                                placeholder="Para os noivos saberem quem presenteou"
                                className={FIELD}
                              />
                            </div>
                            <button type="button" onClick={() => confirmGift('pix')} disabled={isSubmitting} className={`${PRIMARY} w-full`}>
                              {isSubmitting ? 'Enviando…' : 'Já fiz o Pix'}
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : null}

                    {step === 'store' && selected.storeUrl ? (
                      <div className="space-y-5">
                        <p className="text-zinc-600">
                          Compre o presente na loja e depois volte aqui para avisar que já comprou, assim ninguém
                          repete o mesmo item.
                        </p>
                        <a href={selected.storeUrl} target="_blank" rel="noopener noreferrer" className={`${SECONDARY} w-full`}>
                          Abrir a loja ↗
                        </a>
                        <div className="space-y-2 text-left">
                          <label htmlFor="gift-guest-name" className={EYEBROW}>
                            Seu nome
                          </label>
                          <input
                            id="gift-guest-name"
                            value={guestName}
                            onChange={(event) => {
                              setGuestName(event.target.value);
                              setSubmitError('');
                            }}
                            maxLength={150}
                            autoComplete="name"
                            placeholder="Para os noivos saberem quem presenteou"
                            className={FIELD}
                          />
                        </div>
                        <button type="button" onClick={() => confirmGift('store')} disabled={isSubmitting} className={`${PRIMARY} w-full`}>
                          {isSubmitting ? 'Enviando…' : 'Já comprei'}
                        </button>
                      </div>
                    ) : null}

                    {submitError ? <p className="text-sm text-rose-700">{submitError}</p> : null}

                    {step !== 'choose' ? (
                      <button type="button" onClick={() => setStep('choose')} className={`${EYEBROW} hover:opacity-70`}>
                        ← Escolher outra forma
                      </button>
                    ) : null}
                  </div>
                  </div>
                )}
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Portal>
    </main>
  );
}
