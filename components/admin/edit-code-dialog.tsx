"use client";

import { FormEvent, useEffect, useState } from 'react';
import { formatPhone, maskPhoneInput } from '@/lib/phone';

export type EditCodeTarget = {
  id: string;
  code: string;
  guestName: string | null;
  phone: string | null;
};

const FIELD =
  'w-full rounded-xl border border-zinc-800/15 bg-cream px-5 py-3 text-sm text-zinc-800 placeholder:text-zinc-500 focus:border-champagne-600 focus:outline-none focus:ring-2 focus:ring-champagne-600/20';
const LABEL = 'text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70';

const splitNames = (raw: string | null) =>
  (raw ?? '')
    .split('|')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

/**
 * Janela para editar o nome (ou os nomes do casal) e o telefone ligados a um código.
 * Um campo por pessoa: dá para incluir ou tirar uma pessoa (ex.: virar casal).
 */
export function EditCodeDialog({
  target,
  onClose,
  onSave,
}: {
  target: EditCodeTarget | null;
  onClose: () => void;
  onSave: (payload: { id: string; names: string[]; phone: string }) => Promise<void>;
}) {
  const [names, setNames] = useState<string[]>(['']);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    const current = splitNames(target.guestName);
    setNames(current.length > 0 ? current : ['']);
    setPhone(formatPhone(target.phone));
    setError('');
    setIsSaving(false);
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, isSaving, onClose]);

  if (!target) return null;

  const isCouple = names.length === 2;
  const labelFor = (index: number) =>
    isCouple ? (index === 0 ? 'Nome do homem' : 'Nome da mulher') : names.length === 1 ? 'Nome do convidado' : `Pessoa ${index + 1}`;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanNames = names.map((name) => name.trim()).filter((name) => name.length > 0);
    if (cleanNames.length === 0) {
      setError('Informe pelo menos um nome.');
      return;
    }
    const digits = phone.replace(/\D/g, '');
    if (digits.length > 0 && digits.length < 10) {
      setError('Telefone incompleto: informe o DDD e o número.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      await onSave({ id: target.id, names: cleanNames, phone: digits });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-code-title"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm"
      onClick={() => (isSaving ? undefined : onClose())}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-[2rem] border border-zinc-800/10 bg-[#fffaf1] p-6 shadow-2xl sm:p-8"
      >
        <p className={LABEL}>Editar convite</p>
        <h3 id="edit-code-title" className="mt-2 font-display text-4xl italic leading-none text-zinc-800">
          {target.code}
        </h3>

        <div className="mt-6 space-y-4">
          {names.map((name, index) => (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor={`edit-name-${index}`} className={LABEL}>
                  {labelFor(index)}
                </label>
                {names.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setNames((current) => current.filter((_, other) => other !== index))}
                    className="text-xs text-zinc-500 underline underline-offset-2 hover:text-rose-700"
                  >
                    Remover
                  </button>
                ) : null}
              </div>
              <input
                id={`edit-name-${index}`}
                value={name}
                autoFocus={index === 0}
                onChange={(event) => {
                  const value = event.target.value;
                  setNames((current) => current.map((item, other) => (other === index ? value : item)));
                  setError('');
                }}
                className={FIELD}
                placeholder="Nome completo"
              />
            </div>
          ))}

          {names.length < 6 ? (
            <button
              type="button"
              onClick={() => setNames((current) => [...current, ''])}
              className="text-xs font-medium uppercase tracking-[0.14em] text-champagne-700 hover:text-champagne-600"
            >
              + Adicionar pessoa
            </button>
          ) : null}

          <div className="space-y-2">
            <label htmlFor="edit-phone" className={LABEL}>
              Telefone <span className="normal-case tracking-normal text-zinc-500">(opcional)</span>
            </label>
            <input
              id="edit-phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={phone}
              onChange={(event) => {
                setPhone(maskPhoneInput(event.target.value));
                setError('');
              }}
              className={FIELD}
              placeholder="(31) 99999-9999"
            />
          </div>
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-xs text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="inline-flex items-center justify-center rounded-full border border-zinc-800/20 px-6 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-zinc-800 transition-colors hover:bg-zinc-800/5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center justify-center rounded-full bg-champagne-600 px-6 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-[#fff9f1] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}
