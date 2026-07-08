"use client";

import { FormEvent, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AttendanceChoice } from '@/lib/invite';
import { INVITE_ACCESS_KEY, weddingDetails } from '@/lib/invite';

type EnvelopeState = 'fechado' | 'abrindo' | 'aberto';

type InteractiveEnvelopeInviteProps = {
  className?: string;
};

interface Petal {
  id: number;
  left: number;
  size: number;
  duration: number;
  delay: number;
  sway: number;
  rotate: number;
}

type ConfirmationChoice = 'yes' | 'no';

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
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [dietaryNeeds, setDietaryNeeds] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [confirmationChoice, setConfirmationChoice] = useState<ConfirmationChoice | null>(null);
  const [petals, setPetals] = useState<Petal[]>([]);

  // Inicializa o efeito de pétalas apenas no cliente para evitar erros de SSR
  useEffect(() => {
    const generatedPetals = Array.from({ length: 25 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: Math.random() * 10 + 10,
      duration: Math.random() * 6 + 8,
      delay: Math.random() * -14,
      sway: Math.random() * 40 + 20,
      rotate: Math.random() * 360,
    }));
    setPetals(generatedPetals);
  }, []);

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
          if (typeof saved?.adults_count === 'number') {
            setAdults(saved.adults_count);
          }
          if (typeof saved?.children_count === 'number') {
            setChildren(saved.children_count);
          }
          if (typeof saved?.dietary_notes === 'string') {
            setDietaryNeeds(saved.dietary_notes);
          }
        } else {
          setIsLocked(false);
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

  const updateCount = (type: 'adults' | 'children', operation: 'increment' | 'decrement') => {
    if (type === 'adults') {
      setAdults((current) => {
        if (operation === 'increment') return Math.min(10, current + 1);
        return Math.max(1, current - 1);
      });
      return;
    }

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

    try {
      const response = await fetch('/api/rsvp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inviteCode,
          attendance,
          adultsCount: adults,
          childrenCount: children,
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

  // Classe utilitária reutilizável para aplicar a textura de papel via SVG dinâmico
  const paperTextureClass =
    "absolute inset-0 pointer-events-none opacity-[0.11] mix-blend-multiply bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')]";

  const finalInviteContent = (
    <div className="relative z-10 space-y-6">
      <header className="space-y-2 text-center">
        <p className="text-xs uppercase tracking-[0.34em] text-zinc-600">Convite aberto</p>
        {!isLocked ? (
          <>
            <h2 className="font-display text-3xl text-champagne-800 sm:text-5xl">Igor Fialho e Bianca Larissa</h2>
            <p className="text-sm text-zinc-700 sm:text-base">{weddingDetails.date} - {weddingDetails.time}</p>
            <p className="text-sm text-zinc-700 sm:text-base">{weddingDetails.venue}</p>
            <p className="text-xs text-zinc-600 sm:text-sm">{weddingDetails.address}</p>
          </>
        ) : null}
      </header>

      {isLocked ? (
        <div className="space-y-3 py-1 text-center">
          <h2 className="font-display text-3xl text-champagne-800 sm:text-5xl">Igor Fialho e Bianca Larissa</h2>
          <p className="text-sm font-medium tracking-[0.08em] text-zinc-700 sm:text-base">18 ABR 2027 - 16h30</p>
          <p className="text-sm text-zinc-700 sm:text-base">Pampulha - Belo Horizonte</p>
          <p className="text-xs text-zinc-600 sm:text-sm">Av. Otacílio Negrão de Lima, 7630 - Pampulha, Belo Horizonte - MG, 31365-450</p>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-zinc-800">Confirma sua presenca?</legend>
            <div className="grid grid-cols-2 gap-2">
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
                <span className="flex items-center justify-center rounded-lg border border-white/80 bg-white/70 px-3 py-2 text-sm text-zinc-700 transition-colors duration-200 peer-checked:border-olive-400/55 peer-checked:bg-olive-100/45 peer-checked:text-olive-800">
                  Sim
                </span>
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
                    setAdults(1);
                    setChildren(0);
                    setIsSubmitted(false);
                    setSubmitError('');
                    setConfirmationChoice(null);
                  }}
                />
                <span className="flex items-center justify-center rounded-lg border border-white/80 bg-white/70 px-3 py-2 text-sm text-zinc-700 transition-colors duration-200 peer-checked:border-teaRose-300/65 peer-checked:bg-teaRose-100/45 peer-checked:text-teaRose-800">
                  Nao
                </span>
              </label>
            </div>
          </fieldset>

          {attendance ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-800" htmlFor="dietaryNeeds">
                {attendance === 'no' ? 'Justifique' : 'Deixe uma mensagem para o casal'}
              </label>
              <textarea
                id="dietaryNeeds"
                rows={3}
                disabled={isCheckingStatus || isSubmitting}
                value={dietaryNeeds}
                onChange={(event) => setDietaryNeeds(event.target.value)}
                className="focus-rose w-full rounded-lg border border-white/70 bg-white/72 px-3 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-500"
                placeholder={attendance === 'no' ? 'Digite sua justificativa aqui (opcional)' : 'Escreva uma mensagem carinhosa (opcional)'}
              />
            </div>
          ) : null}

          <button
            type="submit"
            disabled={!attendance || !inviteCode || isCheckingStatus || isSubmitting}
            className="shimmer-button flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-[#dcd0b8] to-[#d5b271] px-4 py-2.5 text-sm font-semibold text-zinc-900 transition-all duration-300 hover:-translate-y-[1px] hover:shadow-[0_10px_30px_rgba(188,151,83,0.35)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Enviando...' : 'Confirmar Presenca'}
          </button>

          {submitError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50/90 px-3 py-2 text-xs text-rose-700">
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
                className="rounded-lg border border-olive-300/40 bg-olive-100/55 px-3 py-2 text-xs text-olive-900"
              >
                {attendance === 'no' ? 'Recusa confirmada com sucesso!' : 'Presenca confirmada com sucesso!'}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </form>
      )}
    </div>
  );

  return (
    <main
      className={`paper-texture relative flex min-h-screen items-center justify-center overflow-hidden bg-[#FAF9F6] px-3 py-6 sm:px-4 sm:py-10 ${className || ''}`}
      style={{ perspective: '2500px' }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(245,201,219,0.36),transparent_35%),radial-gradient(circle_at_84%_86%,rgba(164,188,138,0.3),transparent_36%),linear-gradient(180deg,#faf9f6_0%,#f5f0e8_100%)]" />

      {/* ANIMAÇÃO CONTÍNUA DE PÉTALAS DE FLORES */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
        {petals.map((petal) => (
          <motion.div
            key={petal.id}
            className="absolute bg-gradient-to-br from-rose-200/60 to-pink-300/40 backdrop-blur-[0.3px]"
            style={{
              left: `${petal.left}%`,
              width: petal.size,
              height: petal.size * 1.3,
              top: '-5%',
              borderRadius: '100% 10% 100% 100%',
            }}
            animate={{
              y: ['0vh', '105vh'],
              x: [0, petal.sway, -petal.sway / 2, petal.sway / 3, 0],
              rotate: [petal.rotate, petal.rotate + 280],
            }}
            transition={{
              duration: petal.duration,
              repeat: Infinity,
              delay: petal.delay,
              ease: 'linear',
            }}
          />
        ))}
      </div>

      <div className="absolute inset-0 pointer-events-none opacity-80">
        <span className="bouquet-corner left-[-95px] top-[-92px] scale-[0.7] sm:left-[-55px] sm:top-[-52px] sm:scale-100" />
        <span className="bouquet-corner bottom-[-98px] right-[-92px] scale-[0.7] sm:bottom-[-58px] sm:right-[-52px] sm:scale-100" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center gap-6 sm:gap-8">
        <p className="text-xs uppercase tracking-[0.4em] text-zinc-600">Save The Date</p>

        <div className="relative w-full min-h-[20.2rem] sm:min-h-[28.6rem] lg:min-h-[36.4rem]">

          <AnimatePresence>
            {isEnvelopeVisible ? (
              <motion.div
                key="envelope"
                initial={{ opacity: 1, scale: 0.96, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 30, rotateX: 10 }}
                transition={{ duration: 0.7, ease: [0.19, 1, 0.22, 1] }}
                className="absolute inset-0 z-20 flex w-full justify-center [perspective:3000px] [transform-style:preserve-3d]"
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
                aria-label="Envelope do convite"
                whileHover={envelopeState === 'fechado' ? { rotateX: 6, rotateY: -4, scale: 1.015, z: 12 } : {}}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
                className={`group relative h-[20.2rem] w-[min(94vw,22.8rem)] cursor-pointer rounded-2xl bg-transparent text-left focus:outline-none sm:h-[28.6rem] sm:w-[min(94vw,44rem)] lg:h-[36.4rem] lg:w-[min(94vw,58.5rem)] [transform-style:preserve-3d] ${
                  envelopeState === 'fechado'
                    ? ''
                    : 'shadow-[0_35px_75px_rgba(45,42,33,0.14),0_10px_24px_rgba(45,42,33,0.06)]'
                }`}
              >
                
                {/* 1. PAREDE INTERNA TRASEIRA DO ENVELOPE (z-10) */}
                <div className="absolute inset-x-0 top-[22%] z-10 h-[78%] rounded-b-2xl border-x border-b border-[#ded3be] bg-[#f9f5ea] overflow-hidden shadow-[inset_0_20px_30px_rgba(0,0,0,0.07)]">
                  <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#bda886]/40 to-transparent opacity-80" />
                  <div className={paperTextureClass} />
                </div>

                {/* 2. CARTÃO INTERNO (z-20) */}
                <div className="absolute left-1/2 top-[30%] w-[86%] -translate-x-1/2">
                  <motion.div
                    className="w-full [transform-style:preserve-3d]"
                    initial={false}
                    animate={{
                      y: envelopeState === 'aberto' ? '-72%' : '0%',
                      scale: envelopeState === 'aberto' ? 1.04 : 1,
                      opacity: envelopeState === 'aberto' ? 1 : 0,
                      rotate: envelopeState === 'aberto' ? -1.5 : 0, // Leve rotação orgânica ao sair
                      zIndex: envelopeState === 'aberto' ? 60 : 20
                    }}
                    transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                    onAnimationComplete={handleInviteCardAnimationComplete}
                  >
                    <article className="w-full select-none frosted-light gold-frame relative overflow-hidden rounded-[1.35rem] p-5 shadow-2xl sm:p-7 lg:p-8 bg-white/60 backdrop-blur-md">
                      <div className={paperTextureClass} />
                      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
                        <span className="absolute -left-10 -top-10 h-28 w-28 rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(244,181,205,0.35),transparent_64%)]" />
                        <span className="absolute -bottom-12 -right-12 h-32 w-32 rounded-full bg-[radial-gradient(circle_at_45%_45%,rgba(193,182,236,0.32),transparent_62%)]" />
                        <span className="absolute right-4 top-3 text-[0.6rem] text-champagne-700/80">*</span>
                        <span className="absolute left-5 bottom-3 text-[0.6rem] text-champagne-700/80">*</span>
                      </div>

                      <div className="relative z-10 text-center">
                        <p className="font-display text-3xl leading-tight text-champagne-800 sm:text-5xl lg:text-6xl">O Amor Floresce</p>
                        <p className="mt-1 text-sm text-zinc-700 sm:mt-2 sm:text-lg lg:text-xl">Igor e Bianca</p>
                        <p className="mt-2 text-[0.7rem] tracking-[0.22em] text-zinc-600 sm:mt-4 sm:text-sm sm:tracking-[0.25em] lg:text-base">18.04.2027</p>
                      </div>
                    </article>
                  </motion.div>
                </div>

                {/* 3. CORPO FRONTAL E ABAS LATERAIS/INFERIOR (z-30 / z-40) */}
                <div className="absolute inset-x-0 bottom-0 z-30 h-[78%] rounded-b-2xl border-b border-x border-[#dcd0b8] bg-[#faf6ed] overflow-hidden">
                  <div className={paperTextureClass} />
                </div>
                
                <div className="absolute bottom-0 left-0 z-30 h-[78%] w-1/2 [clip-path:polygon(0_0,102%_50%,0_100%)] bg-[#f5eedc] filter drop-shadow-[-3px_4px_8px_rgba(45,42,33,0.09)]">
                  <div className={paperTextureClass} />
                </div>
                
                <div className="absolute bottom-0 right-0 z-30 h-[78%] w-1/2 [clip-path:polygon(100%_0,0_50%,100%_100%)] bg-[#f0e8d4] filter drop-shadow-[3px_4px_8px_rgba(45,42,33,0.09)]">
                  <div className={paperTextureClass} />
                </div>

                <div className="absolute bottom-0 left-0 right-0 z-40 h-[50%] [clip-path:polygon(0_100%,50%_0,100%_100%)] bg-[#f7f2e3] filter drop-shadow-[0_-5px_10px_rgba(45,42,33,0.08)]">
                  <div className={paperTextureClass} />
                </div>

                {/* 4. ABA SUPERIOR ANIMADA (Inicia Z-50, cai para Z-15 após rotacionar) */}
                <motion.div
                  className="absolute inset-x-0 top-[22%] h-[78%] rounded-t-2xl [clip-path:polygon(0_0,100%_0,50%_60%)] [transform-origin:top_center] [transform-style:preserve-3d] transition-colors duration-500 overflow-hidden"
                  style={{
                    backgroundColor: envelopeState === 'fechado' ? '#faf6ed' : '#e6d8ba',
                  }}
                  initial={false}
                  animate={
                    envelopeState === 'fechado' 
                      ? { rotateX: 0, zIndex: 50, boxShadow: '0 12px 15px rgba(45,42,33,0.11)' } 
                      : { rotateX: -179.9, transitionEnd: { zIndex: 15 }, boxShadow: '0 0px 0px rgba(0,0,0,0)' }
                  }
                  transition={{ duration: 0.85, ease: [0.25, 1, 0.5, 1] }}
                  onAnimationComplete={handleFlapAnimationComplete}
                >
                  <div className={paperTextureClass} />
                </motion.div>

                {/* TEXTO INFORMATIVO */}
                {envelopeState === 'fechado' ? (
                  <p className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-zinc-500 animate-pulse sm:-bottom-12 sm:text-xs sm:tracking-[0.25em]">
                    toque para abrir o convite
                  </p>
                ) : null}
              </motion.div>
            </motion.div>
          ) : null}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {showFinalCard ? (
              <motion.section
                key="final-card"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.55, delay: 0.35, ease: 'easeOut' }}
                className="absolute inset-0 z-10 flex items-center justify-center"
              >
                <div className="w-full max-w-xl sm:max-w-2xl">
                  <article className="frosted-light gold-frame relative overflow-hidden rounded-[1.35rem] p-5 shadow-2xl sm:p-7 lg:p-8 bg-white/60 backdrop-blur-md">
                    <div className={paperTextureClass} />
                    <div className="pointer-events-none absolute inset-0">
                      <span className="absolute -left-14 -top-14 h-36 w-36 rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(244,181,205,0.45),transparent_65%)]" />
                      <span className="absolute -bottom-16 -right-16 h-40 w-40 rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(193,182,236,0.4),transparent_65%)]" />
                    </div>
                    {finalInviteContent}
                  </article>
                </div>
              </motion.section>
            ) : null}
          </AnimatePresence>
        </div>

        {confirmationChoice ? (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/35 px-4 backdrop-blur-sm">
            <div className="frosted-light gold-frame w-full max-w-md rounded-2xl bg-white/90 p-5 sm:p-6 shadow-2xl">
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-600">Confirmar resposta</p>
              <h3 className="mt-1 font-display text-3xl text-champagne-800">
                {confirmationChoice === 'yes' ? 'Confirmar presenca' : 'Confirmar recusa'}
              </h3>
              <p className="mt-3 text-sm text-zinc-700">
                {confirmationChoice === 'yes'
                  ? 'Deseja confirmar sua presenca no evento?'
                  : 'Deseja confirmar que nao podera comparecer?'}
              </p>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmationChoice(null)}
                  className="rounded-lg border border-zinc-300 bg-white/80 px-4 py-2 text-sm text-zinc-700 hover:bg-white"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSubmit}
                  className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                    confirmationChoice === 'yes'
                      ? 'border-olive-300 bg-olive-100 text-olive-800 hover:bg-olive-200'
                      : 'border-rose-300 bg-rose-100 text-rose-800 hover:bg-rose-200'
                  }`}
                >
                  {confirmationChoice === 'yes' ? 'Sim, confirmar' : 'Sim, confirmar recusa'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}