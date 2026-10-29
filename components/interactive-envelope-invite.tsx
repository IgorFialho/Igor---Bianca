"use client";

import { Poppins } from 'next/font/google';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AttendanceChoice } from '@/lib/invite';
import { INVITE_ACCESS_KEY, MESSAGE_MAX_LENGTH, limitMessage, messageLength, weddingDetails } from '@/lib/invite';
import { FittedText } from '@/components/home/fitted-text';
import { EmojiPicker } from '@/components/emoji-picker';

// Fonte do design "Save the Date" (textos em branco sobre as flores).
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500'] });

type EnvelopeState = 'fechado' | 'abrindo' | 'aberto';

type InteractiveEnvelopeInviteProps = {
  className?: string;
};

type ConfirmationChoice = 'yes' | 'no';

type ChildDetail = {
  fullName: string;
  age: string;
};

export function InteractiveEnvelopeInvite({ className }: InteractiveEnvelopeInviteProps) {
  const [envelopeState, setEnvelopeState] = useState<EnvelopeState>('fechado');
  const [showFinalCard, setShowFinalCard] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [hasResolvedInitialStatus, setHasResolvedInitialStatus] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [attendance, setAttendance] = useState<AttendanceChoice>('');
  const [expectedResponderCount, setExpectedResponderCount] = useState(1);
  const [responderFullNames, setResponderFullNames] = useState<string[]>(['']);
  const [children, setChildren] = useState(0);
  const [requiresChildrenDetails, setRequiresChildrenDetails] = useState(false);
  const [childrenDetails, setChildrenDetails] = useState<ChildDetail[]>([]);
  const [dietaryNeeds, setDietaryNeeds] = useState('');
  const messageRef = useRef<HTMLTextAreaElement>(null);

  // Insere o emoji onde está o cursor (ou no fim) e devolve o foco ao campo logo depois dele.
  const insertEmoji = (emoji: string) => {
    const field = messageRef.current;
    const start = field?.selectionStart ?? dietaryNeeds.length;
    const end = field?.selectionEnd ?? dietaryNeeds.length;
    const next = dietaryNeeds.slice(0, start) + emoji + dietaryNeeds.slice(end);
    // Não insere se o emoji passaria do limite de caracteres.
    if (messageLength(next) > MESSAGE_MAX_LENGTH) return;
    setDietaryNeeds(next);
    window.requestAnimationFrame(() => {
      if (!field) return;
      const caret = start + emoji.length;
      field.focus();
      field.setSelectionRange(caret, caret);
    });
  };
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [confirmationChoice, setConfirmationChoice] = useState<ConfirmationChoice | null>(null);

  useEffect(() => {
    const storedCode = window.sessionStorage.getItem(INVITE_ACCESS_KEY);

    if (!storedCode) {
      return;
    }

    setInviteCode(storedCode);
  }, []);

  useEffect(() => {
    if (!inviteCode) {
      setHasResolvedInitialStatus(true);
      return;
    }

    const controller = new AbortController();

    const checkRsvpStatus = async () => {
      setIsCheckingStatus(true);
      setSubmitError('');

      try {
        const response = await fetch(`/api/rsvp?code=${encodeURIComponent(inviteCode)}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Nao foi possivel verificar seu RSVP.');
        }

        const data = await response.json();

        if (data?.submitted) {
          setIsLocked(true);
          setIsSubmitted(true);
          setShowFinalCard(true);
          setEnvelopeState('aberto');
          const saved = data.response;
          if (saved?.attendance === 'yes' || saved?.attendance === 'no') {
            setAttendance(saved.attendance);
          }
          if (typeof saved?.expected_responder_count === 'number') {
            setExpectedResponderCount(Math.max(1, Math.min(2, saved.expected_responder_count)));
          }
          if (typeof saved?.responder_full_name === 'string') {
            const names = saved.responder_full_name
              .split('|')
              .map((item: string) => item.trim())
              .filter((item: string) => item.length > 0);
            setResponderFullNames(names.length > 0 ? names.slice(0, 2) : ['']);
          }
          if (typeof saved?.children_count === 'number') {
            setChildren(saved.children_count);
          }
          setRequiresChildrenDetails(Boolean(saved?.requires_children_details));
          if (Array.isArray(saved?.children)) {
            setChildrenDetails(
              saved.children
                .slice(0, 10)
                .map((item: { fullName?: unknown; age?: unknown }) => ({
                  fullName: typeof item?.fullName === 'string' ? item.fullName : '',
                  age: Number.isFinite(Number(item?.age)) ? String(Number(item.age)) : '',
                }))
            );
          }
          if (typeof saved?.dietary_notes === 'string') {
            setDietaryNeeds(saved.dietary_notes);
          }
        } else {
          setIsLocked(false);
          setRequiresChildrenDetails(Boolean(data?.requiresChildrenDetails));
          setExpectedResponderCount(
            typeof data?.expectedResponderCount === 'number'
              ? Math.max(1, Math.min(2, data.expectedResponderCount))
              : 1
          );
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setSubmitError('Erro ao consultar status do RSVP.');
        }
      } finally {
        setIsCheckingStatus(false);
        setHasResolvedInitialStatus(true);
      }
    };

    checkRsvpStatus();

    return () => controller.abort();
  }, [inviteCode]);

  useEffect(() => {
    setResponderFullNames((previous) => {
      const next = Array.from({ length: expectedResponderCount }, (_, index) => previous[index] || '');
      return next;
    });
  }, [expectedResponderCount]);

  useEffect(() => {
    setChildrenDetails((previous) => {
      if (children <= 0) {
        return [];
      }

      const next: ChildDetail[] = [];

      for (let index = 0; index < children; index += 1) {
        next.push(previous[index] || { fullName: '', age: '' });
      }

      return next;
    });
  }, [children]);

  useEffect(() => {
    if (requiresChildrenDetails) {
      return;
    }

    setChildren(0);
    setChildrenDetails([]);
  }, [requiresChildrenDetails]);

  const handleEnvelopeClick = () => {
    if (envelopeState !== 'fechado') {
      return;
    }

    setShowFinalCard(false);
    setEnvelopeState('abrindo');
  };

  const handleFlapAnimationComplete = () => {
    if (envelopeState === 'abrindo') {
      setEnvelopeState('aberto');
    }
  };

  const handleInviteCardAnimationComplete = () => {
    if (envelopeState === 'aberto') {
      setShowFinalCard(true);
    }
  };

  const updateChildrenCount = (operation: 'increment' | 'decrement') => {
    setChildren((current) => {
      if (operation === 'increment') return Math.min(10, current + 1);
      return Math.max(0, current - 1);
    });
  };

  const sendRsvp = async () => {
    if (!attendance || !inviteCode || isLocked || isSubmitting) {
      return;
    }

    setSubmitError('');
    setIsSubmitting(true);

    const normalizedChildrenCount =
      attendance === 'yes' && requiresChildrenDetails ? Math.max(0, Math.min(10, children)) : 0;
    const normalizedResponderFullNames = responderFullNames
      .slice(0, expectedResponderCount)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    const normalizedChildrenDetails = childrenDetails
      .slice(0, normalizedChildrenCount)
      .map((item) => ({
        fullName: item.fullName.trim(),
        age: Number(item.age),
      }));

    if (attendance === 'yes' && normalizedResponderFullNames.length !== expectedResponderCount) {
      setSubmitError(
        expectedResponderCount === 2
          ? 'Informe o nome completo das duas pessoas para confirmar o convite.'
          : 'Informe seu nome completo para confirmar sua presenca.'
      );
      setIsSubmitting(false);
      return;
    }

    if (attendance === 'yes' && normalizedResponderFullNames.some((item) => item.length < 3)) {
      setSubmitError('Cada nome completo deve ter ao menos 3 caracteres.');
      setIsSubmitting(false);
      return;
    }

    if (requiresChildrenDetails && attendance === 'yes' && normalizedChildrenCount > 0) {
      const hasInvalidName = normalizedChildrenDetails.some((item) => item.fullName.length === 0);
      const hasInvalidAge = normalizedChildrenDetails.some(
        (item) => !Number.isInteger(item.age) || item.age < 0 || item.age > 17
      );

      if (hasInvalidName || hasInvalidAge) {
        setSubmitError('Preencha nome completo e idade valida de todos os filhos para continuar.');
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const response = await fetch('/api/rsvp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inviteCode,
          responderFullName: normalizedResponderFullNames[0] || '',
          responderFullNames: normalizedResponderFullNames,
          attendance,
          adultsCount: attendance === 'yes' ? 1 : 0,
          childrenCount: normalizedChildrenCount,
          childrenDetails: normalizedChildrenDetails,
          dietaryNotes: dietaryNeeds,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setIsLocked(true);
          setIsSubmitted(true);
          setSubmitError('Este convite ja confirmou presenca anteriormente.');
          return;
        }

        throw new Error(data?.error || 'Erro ao confirmar RSVP.');
      }

      setIsLocked(true);
      setIsSubmitted(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro inesperado no envio.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!attendance || !inviteCode || isLocked || isSubmitting) {
      return;
    }

    setConfirmationChoice(attendance as ConfirmationChoice);
  };

  const handleConfirmSubmit = async () => {
    if (!confirmationChoice) {
      return;
    }

    setConfirmationChoice(null);
    await sendRsvp();
  };

  const isEnvelopeVisible = hasResolvedInitialStatus && !showFinalCard && !isLocked;
  const responderHeading = responderFullNames
    .slice(0, expectedResponderCount)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .join(' e ');
  const headingDisplayName = responderHeading || 'Convidado';

  // Textura de papel sutil (ruído em SVG) usada nas partes do envelope.
  const paperTextureClass =
    "absolute inset-0 pointer-events-none opacity-[0.08] mix-blend-multiply bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')]";

  // Estilos no mesmo padrão da home: rótulos em maiúsculas espaçadas, campos e botões em pílula.
  const eyebrowClass = 'text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/80';
  const fieldClass =
    'w-full rounded-full border border-zinc-800/15 bg-[#fffaf1] px-5 py-3 text-sm text-zinc-800 placeholder:text-zinc-500 focus:border-champagne-600 focus:outline-none focus:ring-2 focus:ring-champagne-600/20 disabled:opacity-60';
  const choiceClass =
    'flex items-center justify-center rounded-full border border-zinc-800/15 bg-[#fffaf1] px-4 py-3 text-xs font-medium uppercase tracking-[0.2em] text-zinc-800 transition-colors duration-200 hover:border-zinc-800/30 peer-checked:border-champagne-600 peer-checked:bg-champagne-600 peer-checked:text-[#fff9f1] peer-focus-visible:ring-2 peer-focus-visible:ring-champagne-600/30';
  const primaryButtonClass =
    'inline-flex items-center justify-center rounded-full bg-champagne-600 px-10 py-4 text-xs font-medium uppercase tracking-[0.2em] text-[#fff9f1] transition-transform duration-500 ease-[cubic-bezier(0.22,0.72,0.36,1)] hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100';
  const secondaryButtonClass =
    'inline-flex items-center justify-center rounded-full border border-zinc-800/20 px-8 py-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-800 transition-colors hover:bg-zinc-800/5';
  const stepperButtonClass =
    'flex h-9 w-9 items-center justify-center rounded-full border border-zinc-800/15 bg-[#fffaf1] text-base text-zinc-800 transition-colors hover:border-zinc-800/30';

  const finalInviteContent = (
    <div className="relative z-10 space-y-8">
      <header className="space-y-4 text-center">
        <p className={eyebrowClass}>Convidado</p>
        <h2 className="font-display text-5xl italic leading-[0.95] text-zinc-800 [overflow-wrap:anywhere] sm:text-6xl">
          {headingDisplayName}
        </h2>
        <div className="mx-auto h-px w-16 bg-zinc-800/20" />
        <div className="space-y-1.5">
          <p className={eyebrowClass}>
            {weddingDetails.date} · {weddingDetails.time}
          </p>
          <p className="text-base text-zinc-800">{weddingDetails.venue}</p>
          <p className="text-sm text-zinc-600">{weddingDetails.address}</p>
        </div>
      </header>

      {isLocked ? (
        <p className="rounded-2xl border border-zinc-800/10 bg-cream px-5 py-4 text-center text-sm text-zinc-600">
          Sua resposta já foi registrada. Obrigado!
        </p>
      ) : (
        <form className="space-y-6" onSubmit={handleSubmit}>
          <fieldset className="space-y-3">
            <legend className={`${eyebrowClass} mb-3 w-full text-center`}>Confirma sua presença?</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="cursor-pointer">
                <input
                  className="peer sr-only"
                  type="radio"
                  name="attendance"
                  value="yes"
                  disabled={isCheckingStatus || isSubmitting}
                  checked={attendance === 'yes'}
                  onChange={() => {
                    setAttendance('yes');
                    setIsSubmitted(false);
                    setSubmitError('');
                    setConfirmationChoice(null);
                  }}
                />
                <span className={choiceClass}>Sim</span>
              </label>

              <label className="cursor-pointer">
                <input
                  className="peer sr-only"
                  type="radio"
                  name="attendance"
                  value="no"
                  disabled={isCheckingStatus || isSubmitting}
                  checked={attendance === 'no'}
                  onChange={() => {
                    setAttendance('no');
                    setResponderFullNames(Array.from({ length: expectedResponderCount }, () => ''));
                    setChildren(0);
                    setChildrenDetails([]);
                    setIsSubmitted(false);
                    setSubmitError('');
                    setConfirmationChoice(null);
                  }}
                />
                <span className={choiceClass}>Não</span>
              </label>
            </div>
          </fieldset>

          {attendance === 'yes' ? (
            <div className="space-y-5 border-t border-zinc-800/15 pt-6">
              <div className="space-y-3">
                <p className={eyebrowClass}>
                  {expectedResponderCount === 2
                    ? 'Nome completo do casal "Ele e Ela"'
                    : 'Nome completo do convidado'}
                </p>

                {responderFullNames.slice(0, expectedResponderCount).map((name, index) => (
                  <input
                    key={`responder-full-name-${index}`}
                    value={name}
                    onChange={(event) => {
                      const value = event.target.value;
                      setResponderFullNames((previous) =>
                        previous.map((item, itemIndex) => (itemIndex === index ? value : item))
                      );
                    }}
                    disabled={isCheckingStatus || isSubmitting}
                    placeholder="Digite o nome completo"
                    aria-label={`Nome completo ${index + 1}`}
                    className={fieldClass}
                  />
                ))}
              </div>

              {requiresChildrenDetails ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <p className={eyebrowClass}>Quantidade de crianças</p>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => updateChildrenCount('decrement')}
                        className={stepperButtonClass}
                        aria-label="Diminuir crianças"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-lg tabular-nums text-zinc-800">{children}</span>
                      <button
                        type="button"
                        onClick={() => updateChildrenCount('increment')}
                        className={stepperButtonClass}
                        aria-label="Aumentar crianças"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {children > 0 ? (
                    <div className="space-y-3 rounded-3xl border border-zinc-800/10 bg-cream p-4">
                      <p className="text-sm text-zinc-600">Informe nome completo e idade de cada filho</p>

                      {childrenDetails.map((child, index) => (
                        <div key={`child-${index}`} className="grid gap-2 sm:grid-cols-[1fr_110px]">
                          <input
                            value={child.fullName}
                            onChange={(event) => {
                              const value = event.target.value;
                              setChildrenDetails((previous) =>
                                previous.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, fullName: value } : item
                                )
                              );
                            }}
                            disabled={isCheckingStatus || isSubmitting}
                            placeholder={`Nome completo do filho ${index + 1}`}
                            aria-label={`Nome completo do filho ${index + 1}`}
                            className={fieldClass}
                          />
                          <input
                            type="number"
                            min={0}
                            max={17}
                            value={child.age}
                            onChange={(event) => {
                              const value = event.target.value;
                              setChildrenDetails((previous) =>
                                previous.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, age: value } : item
                                )
                              );
                            }}
                            disabled={isCheckingStatus || isSubmitting}
                            placeholder="Idade"
                            aria-label={`Idade do filho ${index + 1}`}
                            className={fieldClass}
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {attendance ? (
            <div className="space-y-3">
              <label className={eyebrowClass} htmlFor="dietaryNeeds">
                {attendance === 'no' ? 'Justifique' : 'Deixe uma mensagem para o casal'}
              </label>
              <div className="relative">
                <textarea
                  ref={messageRef}
                  id="dietaryNeeds"
                  rows={3}
                  disabled={isCheckingStatus || isSubmitting}
                  value={dietaryNeeds}
                  onChange={(event) => setDietaryNeeds(limitMessage(event.target.value))}
                  className={`${fieldClass} rounded-3xl py-4 pr-16`}
                  placeholder={attendance === 'no' ? 'Digite sua justificativa aqui (opcional)' : 'Escreva uma mensagem carinhosa (opcional)'}
                />
                <div className="absolute bottom-3 right-3">
                  <EmojiPicker onSelect={insertEmoji} disabled={isCheckingStatus || isSubmitting} />
                </div>
              </div>
              {/* Contador: a mensagem vira um post-it na home e precisa caber em telas pequenas. */}
              <p
                aria-live="polite"
                className={`px-2 text-right text-xs tabular-nums ${
                  messageLength(dietaryNeeds) >= MESSAGE_MAX_LENGTH ? 'text-rose-700' : 'text-zinc-500'
                }`}
              >
                {messageLength(dietaryNeeds)}/{MESSAGE_MAX_LENGTH} caracteres
              </p>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={!attendance || !inviteCode || isCheckingStatus || isSubmitting}
            className={`${primaryButtonClass} w-full`}
          >
            {isSubmitting ? 'Enviando...' : 'Confirmar presença'}
          </button>

          {submitError ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {submitError}
            </p>
          ) : null}

          <AnimatePresence mode="wait">
            {isSubmitted ? (
              <motion.p
                key="success"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="rounded-2xl border border-olive-300/40 bg-olive-50 px-4 py-3 text-sm text-olive-900"
              >
                {attendance === 'no' ? 'Recusa confirmada com sucesso!' : 'Presença confirmada com sucesso!'}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </form>
      )}
    </div>
  );

  return (
    <main className={`relative flex min-h-screen flex-col items-center px-4 py-14 text-zinc-800 sm:px-6 sm:py-16 ${className || ''}`}>
      {/* Fundo: jardim de rosas brancas (foto de Roman Odintsov no Pexels); versão menor no celular.
          O foco fica no canteiro de rosas, que é o que aparece no corte vertical do celular. */}
      <picture className="pointer-events-none fixed inset-0 z-0">
        <source media="(max-width: 767px)" srcSet="/imagens/convite/jardim-fundo-mobile.jpg" />
        <img src="/imagens/convite/jardim-fundo.jpg" alt="" className="h-full w-full object-cover" style={{ objectPosition: '50% 60%' }} />
      </picture>
      {/* Véu no tom de texto do site (#2f241b), mais forte no topo e embaixo para os textos brancos lerem bem. */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(180deg,rgba(47,36,27,0.42)_0%,rgba(47,36,27,0.12)_35%,rgba(47,36,27,0.12)_65%,rgba(47,36,27,0.45)_100%)]" />

      {/* Título só para leitores de tela (o "Save the date" visível foi removido do design). */}
      <header className="relative z-30 mb-8 text-center sm:mb-12">
        <h1 className="sr-only">Igor &amp; Bianca · 18 de abril de 2027</h1>
      </header>

      {/* Espaço extra no topo para o cartão subir para fora do envelope ao abrir. */}
      <div
        className="relative z-10 w-full max-w-7xl pt-[min(24vw,9rem)]"
        style={{ minHeight: isEnvelopeVisible ? 'calc(min(24vw, 9rem) + min(56.8vw, 28.4rem) + 6rem)' : undefined }}
      >
        <AnimatePresence>
          {isEnvelopeVisible ? (
            <motion.div
              key="envelope"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 30 }}
              transition={{ duration: 0.7, ease: [0.19, 1, 0.22, 1] }}
              className="absolute inset-x-0 top-0 z-20 flex flex-col items-center pt-[min(24vw,9rem)]"
            >
              <motion.div
                role="button"
                tabIndex={0}
                onClick={handleEnvelopeClick}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleEnvelopeClick();
                  }
                }}
                aria-label="Abrir o convite"
                whileHover={envelopeState === 'fechado' ? { scale: 1.02, y: -4 } : {}}
                transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                className="relative aspect-[1.55] w-[min(88vw,44rem)] cursor-pointer rounded-[4px] shadow-[0_24px_60px_rgba(0,0,0,0.22)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                style={{ perspective: '1600px' }}
              >
                {/* 1. Parte de dentro do envelope */}
                <div className="absolute inset-0 z-10 overflow-hidden rounded-[4px] bg-[#e7e9de] shadow-[inset_0_18px_30px_rgba(0,0,0,0.10)]">
                  <div className={paperTextureClass} />
                </div>

                {/* 2. Cartão que sobe de dentro do envelope */}
                {/* O z-index fica aqui: o translate deste elemento cria uma camada própria que prenderia o cartão. */}
                <div className={`absolute left-1/2 top-[6%] w-[90%] -translate-x-1/2 ${envelopeState === 'aberto' ? 'z-[60]' : 'z-20'}`}>
                  <motion.div
                    className="relative w-full"
                    initial={false}
                    animate={{
                      y: envelopeState === 'aberto' ? '-68%' : '0%',
                      opacity: envelopeState === 'aberto' ? 1 : 0,
                      rotate: envelopeState === 'aberto' ? -1.5 : 0, // Leve rotação orgânica ao sair
                      zIndex: envelopeState === 'aberto' ? 60 : 20,
                    }}
                    transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                    onAnimationComplete={handleInviteCardAnimationComplete}
                  >
                    <article className="relative w-full select-none overflow-hidden rounded-[0.6rem] border border-zinc-800/10 bg-[#fffaf1] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.18)] sm:p-8">
                      <div className={paperTextureClass} />
                      <div className="relative z-10 flex flex-col items-center gap-1 text-center text-zinc-800">
                        <FittedText text="Igor & Bianca" />
                        <p className={`${poppins.className} text-[0.7rem] uppercase tracking-[0.2em] text-zinc-600 sm:text-xs`}>18 . 04 . 2027</p>
                      </div>
                    </article>
                  </motion.div>
                </div>

                {/* 3. Abas da frente: laterais e de baixo, em tons de marfim como o envelope do design */}
                <div className="absolute inset-0 z-30 drop-shadow-[3px_0_8px_rgba(0,0,0,0.16)]">
                  <div className="h-full w-full bg-[#eff0e7] [clip-path:polygon(0_0,52%_55%,0_100%)]" />
                </div>
                <div className="absolute inset-0 z-30 drop-shadow-[-3px_0_8px_rgba(0,0,0,0.16)]">
                  <div className="h-full w-full bg-[#ecede4] [clip-path:polygon(100%_0,48%_55%,100%_100%)]" />
                </div>
                <div className="absolute inset-0 z-40 drop-shadow-[0_-5px_10px_rgba(0,0,0,0.18)]">
                  <div className="h-full w-full bg-[#f6f7f1] [clip-path:polygon(0_100%,50%_47%,100%_100%)]" />
                </div>

                {/* 4. Aba de cima: dobra para cima ao abrir e depois fica atrás do cartão */}
                <motion.div
                  className="absolute inset-x-0 top-0 h-[58%] [transform-origin:top_center]"
                  initial={false}
                  animate={
                    envelopeState === 'fechado'
                      ? { rotateX: 0, zIndex: 50 }
                      : { rotateX: -179.9, transitionEnd: { zIndex: 15 } }
                  }
                  transition={{ duration: 0.85, ease: [0.25, 1, 0.5, 1] }}
                  onAnimationComplete={handleFlapAnimationComplete}
                >
                  <div className="h-full w-full drop-shadow-[0_8px_12px_rgba(0,0,0,0.22)]">
                    <div
                      className="h-full w-full transition-colors duration-500 [clip-path:polygon(0_0,100%_0,50%_100%)]"
                      style={{ backgroundColor: envelopeState === 'fechado' ? '#e8eadf' : '#dfe1d5' }}
                    />
                  </div>
                </motion.div>
              </motion.div>

              {envelopeState === 'fechado' ? (
                <p className={`${poppins.className} mt-8 animate-pulse text-center text-sm uppercase tracking-[0.04em] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)] sm:mt-10 sm:text-lg`}>
                  Toque para abrir o convite
                </p>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {showFinalCard ? (
            <motion.section
              key="final-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.76, delay: 0.35, ease: [0.22, 0.72, 0.36, 1] }}
              className="relative z-10 flex justify-center"
            >
              <div className="w-full max-w-xl sm:max-w-2xl">
                <article className="relative overflow-hidden rounded-[2rem] border border-zinc-800/10 bg-[#fffaf1] shadow-[0_24px_60px_rgba(47,36,27,0.12)]">
                  <div className="relative z-10 p-6 sm:p-10">
                    {finalInviteContent}
                  </div>
                </article>
              </div>
            </motion.section>
          ) : null}
        </AnimatePresence>
      </div>

      {confirmationChoice ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-zinc-800/10 bg-[#fffaf1] p-6 text-center shadow-2xl sm:p-8">
            <p className={eyebrowClass}>Confirmar resposta</p>
            <h3 className="mt-3 font-display text-4xl italic leading-none text-zinc-800">
              {confirmationChoice === 'yes' ? 'Confirmar presença' : 'Confirmar recusa'}
            </h3>
            <p className="mt-4 text-base text-zinc-600">
              {confirmationChoice === 'yes'
                ? 'Deseja confirmar sua presença no evento?'
                : 'Deseja confirmar que não poderá comparecer?'}
            </p>

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
              <button type="button" onClick={() => setConfirmationChoice(null)} className={secondaryButtonClass}>
                Voltar
              </button>
              <button type="button" onClick={handleConfirmSubmit} className={primaryButtonClass}>
                {confirmationChoice === 'yes' ? 'Sim, confirmar' : 'Sim, confirmar recusa'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
