"use client";

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Portal } from '@/components/home/portal';
import { Reveal } from '@/components/home/reveal';
import { INVITE_ACCESS_KEY } from '@/lib/invite';

/** Mesmo nome lembrado pela lista de presentes (quem já presenteou não precisa digitar de novo). */
const GUEST_NAME_KEY = 'igor-bianca-gift-guest-name';
const FIELD =
  'w-full rounded-3xl border border-zinc-800/15 bg-cream px-5 py-3 text-sm text-zinc-800 placeholder:text-zinc-500 focus:border-champagne-600 focus:outline-none focus:ring-2 focus:ring-champagne-600/20';

// Pix avulso: presente em dinheiro com o valor que o convidado escolher. Usa o mesmo gerador de Pix da lista
// (/api/gifts/pix): QR Code + "copia e cola", direto na conta dos noivos. Depois de pagar, o convidado informa o nome
// e toca em "Já fiz o Pix": o registro (nome, valor, recado) aparece no painel para os noivos conferirem.

const EASE = [0.22, 1, 0.36, 1] as const;
const EYEBROW = 'text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70';
const PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-full bg-champagne-600 px-8 py-3.5 text-xs font-medium uppercase tracking-[0.2em] text-[#fff9f1] transition-transform duration-500 ease-[cubic-bezier(0.22,0.72,0.36,1)] hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100';
const SECONDARY =
  'inline-flex items-center justify-center rounded-full border border-zinc-800/20 px-6 py-3 text-xs font-medium uppercase tracking-[0.16em] text-zinc-800 transition-colors hover:bg-zinc-800/5';

/** Valores rápidos (em reais). */
const QUICK_AMOUNTS = [50, 100, 200, 500];

type PixData = { payload: string; qrSvg: string; receiverName: string };
type Choice = { kind: 'quick'; value: number } | { kind: 'other' };
type Step = 'amount' | 'pix' | 'confirm' | 'thanks';

function formatPrice(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** "150", "150,5", "1.250,00" ou "R$ 80" → centavos (null se não der para entender). */
function parseAmount(text: string) {
  const clean = text.replace(/[^\d,.]/g, '');
  if (!clean) return null;
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean.replace(/\.(?=\d{3}(\D|$))/g, '');
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** Ícone do Pix (losango). */
function PixIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 2.8 21.2 12 12 21.2 2.8 12z" strokeLinejoin="round" />
      <path d="m7.6 9.2 2.6 2.6a2.5 2.5 0 0 0 3.6 0l2.6-2.6M7.6 14.8l2.6-2.6a2.5 2.5 0 0 1 3.6 0l2.6 2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FreePix() {
  const [isOpen, setIsOpen] = useState(false);
  const [choice, setChoice] = useState<Choice>({ kind: 'quick', value: 100 });
  const [other, setOther] = useState('');
  const [pix, setPix] = useState<PixData | null>(null);
  const [amountShown, setAmountShown] = useState<number>(0);
  const [step, setStep] = useState<Step>('amount');
  const [guestName, setGuestName] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const otherRef = useRef<HTMLInputElement>(null);

  // Janela aberta: trava a página de trás e fecha com Esc.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setIsOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  const open = () => {
    setIsOpen(true);
    setPix(null);
    setStep('amount');
    setError('');
    setCopied(false);
    setMessage('');
    try {
      setGuestName((current) => current || window.localStorage.getItem(GUEST_NAME_KEY) || '');
    } catch {
      // Sem armazenamento: a pessoa digita o nome.
    }
  };

  // "Já fiz o Pix": registra nome e valor para os noivos conferirem no painel.
  const askConfirm = () => {
    if (guestName.trim().length < 2) {
      setError('Informe seu nome para os noivos saberem quem presenteou.');
      document.getElementById('free-pix-name')?.focus();
      return;
    }
    setError('');
    setStep('confirm');
  };
  const sendConfirmation = async () => {
    const name = guestName.trim();
    setIsSending(true);
    setError('');
    try {
      try {
        window.localStorage.setItem(GUEST_NAME_KEY, name);
      } catch {
        // Lembrar o nome é só conveniência.
      }
      const response = await fetch('/api/gifts/free-pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: name,
          amountCents: amountShown,
          message: message.trim() || undefined,
          inviteCode: window.sessionStorage.getItem(INVITE_ACCESS_KEY) || undefined,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Não foi possível registrar.');
      setStep('thanks');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Não foi possível registrar.');
      setStep('pix');
    } finally {
      setIsSending(false);
    }
  };

  const generate = async () => {
    let amount = choice.kind === 'quick' ? choice.value * 100 : parseAmount(other);
    if (!amount || amount < 100) {
      setError('Digite um valor a partir de R$ 1,00.');
      otherRef.current?.focus();
      return;
    }
    if (amount > 10_000_000) amount = 10_000_000;
    setError('');
    setIsLoading(true);
    try {
      const response = await fetch(`/api/gifts/pix?amount=${amount}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Erro ao gerar o Pix.');
      setPix(data);
      setAmountShown(amount);
      setStep('pix');
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Erro ao gerar o Pix.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyPix = async () => {
    if (!pix) return;
    try {
      await navigator.clipboard.writeText(pix.payload);
    } catch {
      // Sem permissão de área de transferência: copia por um campo invisível temporário.
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

  const chip = (selected: boolean) =>
    `rounded-full border px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
      selected
        ? 'border-champagne-600 bg-champagne-600 text-[#fff9f1] shadow-[0_8px_20px_rgba(138,90,43,0.25)]'
        : 'border-zinc-800/15 bg-[#fffaf1] text-zinc-800 hover:border-champagne-600/50'
    }`;

  return (
    <>
      {/* Convite discreto para o Pix avulso: uma linha de texto com um botão-link, sem competir com a lista. */}
      <Reveal delay={0.2}>
        <p className="mx-auto mt-6 flex max-w-2xl flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-zinc-500">
          <span>Prefere escolher o valor?</span>
          <button
            type="button"
            onClick={open}
            className="group inline-flex items-center gap-1.5 font-medium text-champagne-700 underline decoration-champagne-600/30 underline-offset-4 transition-colors hover:decoration-champagne-600"
          >
            <PixIcon className="h-3.5 w-3.5" />
            Faça um Pix avulso
            <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-0.5">→</span>
          </button>
        </p>
      </Reveal>

      <Portal>
        <AnimatePresence>
          {isOpen ? (
            <motion.div
              key="free-pix"
              role="dialog"
              aria-modal="true"
              aria-label="Pix avulso"
              className="fixed inset-0 z-[200] flex items-end justify-center bg-zinc-950/45 backdrop-blur-sm sm:items-center sm:p-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
            >
              <motion.div
                className="relative max-h-[92svh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-[#fffaf1] p-6 text-center shadow-2xl sm:rounded-[2rem] sm:p-8"
                style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
                initial={{ y: 40 }}
                animate={{ y: 0 }}
                exit={{ y: 40 }}
                transition={{ duration: 0.45, ease: EASE }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    aria-label="Fechar"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800/10 bg-[#fffaf1]/90 text-zinc-800 hover:bg-[#fffaf1]"
                  >
                    ✕
                  </button>
                </div>

                <div className="-mt-4 space-y-6">
                  <div>
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-champagne-600/10 text-champagne-700">
                      <PixIcon className="h-6 w-6" />
                    </span>
                    <p className={`${EYEBROW} mt-3`}>Pix avulso</p>
                    <h2 className="mt-2 font-display text-4xl leading-tight">Presente com carinho</h2>
                    {step !== 'amount' ? (
                      <p className="mt-2 text-2xl text-champagne-700">{formatPrice(amountShown)}</p>
                    ) : (
                      <p className="mx-auto mt-3 max-w-sm text-sm text-zinc-600">Escolha quanto quer enviar. O valor vai direto para a conta dos noivos.</p>
                    )}
                  </div>

                  {step === 'amount' ? (
                    <div className="space-y-5">
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" role="radiogroup" aria-label="Valor do Pix">
                        {QUICK_AMOUNTS.map((value) => {
                          const selected = choice.kind === 'quick' && choice.value === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              onClick={() => {
                                setChoice({ kind: 'quick', value });
                                setError('');
                              }}
                              className={chip(selected)}
                            >
                              R$ {value}
                            </button>
                          );
                        })}
                      </div>

                      {/* Outro valor */}
                      <label
                        className={`flex items-center gap-2 rounded-full border bg-cream px-5 py-1 text-left transition-all ${
                          choice.kind === 'other' ? 'border-champagne-600 ring-2 ring-champagne-600/20' : 'border-zinc-800/15'
                        }`}
                      >
                        <span className="text-sm font-medium text-zinc-500">R$</span>
                        <input
                          ref={otherRef}
                          value={other}
                          onFocus={() => setChoice({ kind: 'other' })}
                          onChange={(event) => {
                            setOther(event.target.value.replace(/[^\d,.]/g, '').slice(0, 12));
                            setChoice({ kind: 'other' });
                            setError('');
                          }}
                          onBlur={() => {
                            const cents = parseAmount(other);
                            if (cents) setOther((cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                          }}
                          inputMode="decimal"
                          placeholder="Outro valor"
                          aria-label="Outro valor em reais"
                          className="w-full min-w-0 bg-transparent py-2.5 text-sm text-zinc-800 placeholder:text-zinc-500 focus:outline-none"
                        />
                      </label>

                      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

                      <button type="button" onClick={generate} disabled={isLoading} className={`${PRIMARY} w-full`}>
                        {isLoading ? 'Gerando o Pix…' : 'Gerar Pix'}
                      </button>
                    </div>
                  ) : step === 'pix' && pix ? (
                    <motion.div className="space-y-5" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}>
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
                      <div className="space-y-3 border-t border-zinc-800/10 pt-5 text-left">
                        <p className="text-center text-sm text-zinc-600">Depois de pagar, conte para a gente quem enviou:</p>
                        <label htmlFor="free-pix-name" className={EYEBROW}>
                          Seu nome
                        </label>
                        <input
                          id="free-pix-name"
                          value={guestName}
                          onChange={(event) => {
                            setGuestName(event.target.value);
                            setError('');
                          }}
                          maxLength={150}
                          autoComplete="name"
                          placeholder="Para os noivos saberem quem presenteou"
                          className={FIELD}
                        />
                        <label htmlFor="free-pix-message" className={`${EYEBROW} block pt-1`}>
                          Recado <span className="normal-case tracking-normal text-zinc-500">(opcional)</span>
                        </label>
                        <textarea
                          id="free-pix-message"
                          value={message}
                          onChange={(event) => setMessage(event.target.value.slice(0, 300))}
                          rows={2}
                          placeholder="Um carinho para os noivos…"
                          className={`${FIELD} resize-none`}
                        />
                      </div>
                      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
                      <div className="flex flex-col gap-2">
                        <button type="button" onClick={askConfirm} className={`${PRIMARY} w-full`}>
                          Já fiz o Pix
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPix(null);
                            setStep('amount');
                            setError('');
                          }}
                          className={`${EYEBROW} py-2 hover:opacity-70`}
                        >
                          ← Mudar o valor
                        </button>
                      </div>
                    </motion.div>
                  ) : step === 'confirm' ? (
                    <motion.div className="space-y-5" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
                      <h3 className="font-display text-3xl leading-tight">Você já enviou o Pix?</h3>
                      <p className="text-sm text-zinc-600">
                        Confirme só depois de pagar os <strong className="text-zinc-800">{formatPrice(amountShown)}</strong>. O registro fica no nome de{' '}
                        <strong className="text-zinc-800">{guestName.trim()}</strong> para os noivos conferirem.
                      </p>
                      <div className="flex flex-col gap-3">
                        <button type="button" onClick={sendConfirmation} disabled={isSending} className={`${PRIMARY} w-full`}>
                          {isSending ? 'Enviando…' : 'Sim, já enviei'}
                        </button>
                        <button type="button" onClick={() => setStep('pix')} disabled={isSending} className={`${SECONDARY} w-full`}>
                          Ainda não
                        </button>
                      </div>
                    </motion.div>
                  ) : step === 'thanks' ? (
                    <motion.div className="space-y-5" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}>
                      <p className="font-display text-3xl italic leading-tight text-zinc-800">Muito obrigado! 💛</p>
                      <p className="text-zinc-600">Ficamos muito felizes com o seu carinho.</p>
                      <button type="button" onClick={() => setIsOpen(false)} className={`${PRIMARY} w-full`}>
                        Voltar à lista
                      </button>
                    </motion.div>
                  ) : null}
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Portal>
    </>
  );
}
