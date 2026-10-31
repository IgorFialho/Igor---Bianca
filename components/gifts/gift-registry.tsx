"use client";

import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Portal } from '@/components/home/portal';
import { Reveal } from '@/components/home/reveal';
import { INVITE_ACCESS_KEY } from '@/lib/invite';
import type { PublicGift } from '@/lib/gifts';

const THANK_YOU_PHOTO = '/imagens/casal/casal-08.jpeg';
const GUEST_NAME_KEY = 'igor-bianca-gift-guest-name';
const PANEL_EASE = [0.22, 1, 0.36, 1] as const;

const EYEBROW = 'text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70';
const PRIMARY =
  'inline-flex items-center justify-center rounded-full bg-champagne-600 px-8 py-3.5 text-xs font-medium uppercase tracking-[0.2em] text-[#fff9f1] transition-transform duration-500 ease-[cubic-bezier(0.22,0.72,0.36,1)] hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100';
const SECONDARY =
  'inline-flex items-center justify-center rounded-full border border-zinc-800/20 px-6 py-3 text-xs font-medium uppercase tracking-[0.16em] text-zinc-800 transition-colors hover:bg-zinc-800/5';
const FIELD =
  'w-full rounded-3xl border border-zinc-800/15 bg-cream px-5 py-3 text-sm text-zinc-800 placeholder:text-zinc-500 focus:border-champagne-600 focus:outline-none focus:ring-2 focus:ring-champagne-600/20';

type Step = 'choose' | 'pix' | 'store' | 'thanks';
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
      setGifts(data.gifts ?? []);
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
      // Sem permissão de área de transferência: seleciona o texto para a pessoa copiar manualmente.
      const field = document.getElementById('pix-payload') as HTMLTextAreaElement | null;
      field?.select();
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

  return (
    <main className="relative min-h-screen bg-cream px-6 pb-24 pt-8 text-zinc-800 md:px-10">
      {/* Link à direita: o canto superior esquerdo é ocupado pelo player de música. */}
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-end">
        <Link href="/login" className={`${EYEBROW} transition-opacity hover:opacity-70`}>
          ← Voltar ao site
        </Link>
      </nav>

      <header className="mx-auto mt-16 max-w-3xl text-center md:mt-20">
        <Reveal>
          <p className={EYEBROW}>Lista de presentes</p>
          <h1 className="mt-4 font-display text-[3rem] leading-[0.92] md:text-[4.5rem]">Um presente para o nosso novo lar</h1>
        </Reveal>
        <Reveal delay={0.14}>
          <p className="mx-auto mt-6 max-w-2xl text-base text-zinc-600 md:text-lg">
            Sua presença é o nosso maior presente. Se quiser nos presentear, escolha um item abaixo: você pode
            enviar o valor por Pix ou comprar na loja indicada.
          </p>
        </Reveal>
      </header>

      <section aria-label="Presentes" className="mx-auto mt-14 w-full max-w-6xl">
        {isLoading ? <p className="text-center text-zinc-600">Carregando presentes…</p> : null}
        {loadError ? <p className="text-center text-rose-700">{loadError}</p> : null}
        {!isLoading && !loadError && gifts.length === 0 ? (
          <p className="text-center text-zinc-600">A lista de presentes será publicada em breve.</p>
        ) : null}

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {gifts.map((gift, index) => {
            const isTaken = gift.status !== 'available';
            return (
              <Reveal key={gift.id} delay={(index % 3) * 0.1}>
                <article
                  // Hover só nos disponíveis: o card sobe um pouco, a sombra cresce e a foto aproxima devagar.
                  className={`flex h-full flex-col overflow-hidden rounded-[2rem] border border-zinc-800/10 bg-[#fffaf1] shadow-[0_24px_60px_rgba(47,36,27,0.08)] transition-[opacity,transform,box-shadow] duration-500 ease-[cubic-bezier(0.22,0.72,0.36,1)] ${
                    isTaken ? 'opacity-60' : 'group hover:-translate-y-2 hover:shadow-[0_32px_70px_rgba(47,36,27,0.16)]'
                  }`}
                >
                  <div className="relative aspect-[4/3] w-full">
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
                        onClick={() => openGift(gift)}
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
                className="max-h-[92svh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-[#fffaf1] p-6 text-center shadow-2xl sm:rounded-[2rem] sm:p-8"
                initial={{ y: 40 }}
                animate={{ y: 0 }}
                exit={{ y: 40 }}
                transition={{ duration: 0.45, ease: PANEL_EASE }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    aria-label="Fechar"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800/10 text-zinc-800 hover:bg-zinc-800/5"
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
                  <div className="space-y-6">
                    <div>
                      <p className={EYEBROW}>Presentear</p>
                      <h2 className="mt-2 font-display text-4xl leading-tight">{selected.title}</h2>
                      <p className="mt-2 text-2xl text-champagne-700">{formatPrice(selected.priceCents)}</p>
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
                            <div className="space-y-2 text-left">
                              <label htmlFor="pix-payload" className={EYEBROW}>
                                Pix copia e cola
                              </label>
                              <textarea id="pix-payload" readOnly rows={3} value={pix.payload} className={`${FIELD} font-mono text-xs`} />
                              <button type="button" onClick={copyPix} className={`${SECONDARY} w-full`}>
                                {copied ? 'Código copiado ✓' : 'Copiar código'}
                              </button>
                              <p className="text-xs text-zinc-500">Recebedor: {pix.receiverName}. O valor já vem preenchido.</p>
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
                )}
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Portal>
    </main>
  );
}
