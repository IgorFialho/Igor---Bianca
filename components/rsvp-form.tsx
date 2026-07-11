"use client";

import { AnimatePresence, motion } from 'framer-motion';
import { FormEvent, useState } from 'react';
import type { AttendanceChoice } from '@/lib/invite';

type ConfirmationChoice = 'yes' | 'no';

export function RsvpForm() {
  const [attendance, setAttendance] = useState<AttendanceChoice>('');
  const [children, setChildren] = useState(0);
  const [dietaryNeeds, setDietaryNeeds] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [confirmationChoice, setConfirmationChoice] = useState<ConfirmationChoice | null>(null);

  const updateChildrenCount = (operation: 'increment' | 'decrement') => {
    setChildren((current) => {
      if (operation === 'increment') return Math.min(10, current + 1);
      return Math.max(0, current - 1);
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!attendance) {
      return;
    }

    setConfirmationChoice(attendance as ConfirmationChoice);
  };

  const handleConfirmSubmit = () => {
    setConfirmationChoice(null);
    setIsSubmitted(true);
  };

  return (
    <section className="frosted-light gold-frame relative z-10 w-full rounded-[1.2rem] p-4 sm:p-5">
      <div className="space-y-3">
        <h2 className="font-display text-5xl leading-none text-champagne-800">Confirmar Presenca</h2>
      </div>

      <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-zinc-800">Presenca</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="cursor-pointer">
              <input
                className="peer sr-only"
                type="radio"
                name="attendance"
                value="yes"
                checked={attendance === 'yes'}
                onChange={() => {
                  setAttendance('yes');
                  setIsSubmitted(false);
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
                checked={attendance === 'no'}
                onChange={() => {
                  setAttendance('no');
                  setChildren(0);
                  setIsSubmitted(false);
                  setConfirmationChoice(null);
                }}
              />
              <span className="flex items-center justify-center rounded-lg border border-white/80 bg-white/70 px-3 py-2 text-sm text-zinc-700 transition-colors duration-200 peer-checked:border-teaRose-300/65 peer-checked:bg-teaRose-100/45 peer-checked:text-teaRose-800">
                Não
              </span>
            </label>
          </div>
        </fieldset>

        <AnimatePresence initial={false}>
          {attendance === 'yes' ? (
            /* Framer Motion: guest counters slide in only for positive attendance. */
            <motion.div
              key="guests"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <p className="text-xs text-zinc-700">Quantidade de Crianças</p>
                <div className="rounded-lg border border-white/80 bg-white/72 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-700">Crianças</span>
                    <button
                      type="button"
                      onClick={() => updateChildrenCount('decrement')}
                      className="h-7 w-7 rounded border border-white/70 bg-white/90 text-sm text-zinc-700 transition hover:bg-teaRose-100"
                      aria-label="Diminuir crianças"
                    >
                      -
                    </button>
                    <span className="w-5 text-center text-sm text-zinc-800">{children}</span>
                    <button
                      type="button"
                      onClick={() => updateChildrenCount('increment')}
                      className="h-7 w-7 rounded border border-white/70 bg-white/90 text-sm text-zinc-700 transition hover:bg-teaRose-100"
                      aria-label="Aumentar crianças"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-800" htmlFor="dietaryNeeds">
            Restrições Alimentares / Observações
          </label>
          <textarea
            id="dietaryNeeds"
            rows={3}
            value={dietaryNeeds}
            onChange={(event) => setDietaryNeeds(event.target.value)}
            className="focus-rose w-full rounded-lg border border-white/70 bg-white/72 px-3 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-500"
            placeholder="Opcional"
          />
        </div>

        <button
          type="submit"
          disabled={!attendance}
          className="shimmer-button flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-zinc-900 transition-all duration-300 hover:-translate-y-[1px] hover:shadow-[0_10px_30px_rgba(188,151,83,0.25)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Confirmar e Florescer Juntos
        </button>

        <AnimatePresence mode="wait">
          {isSubmitted ? (
            /* Framer Motion: success feedback fades in after the RSVP is sent. */
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

      {confirmationChoice ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/35 px-4">
          <div className="frosted-light gold-frame w-full max-w-md rounded-2xl p-5 sm:p-6">
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
                className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
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
    </section>
  );
}
