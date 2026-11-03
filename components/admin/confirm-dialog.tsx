"use client";

import { useEffect, useState, type ReactNode } from 'react';

export type ConfirmRequest = {
  /** Linha pequena acima do título (ex.: "Confirmar exclusao"). */
  eyebrow?: string;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  /** "danger" para exclusões/cancelamentos; "primary" para as demais ações. */
  tone?: 'danger' | 'primary';
  onConfirm: () => void | Promise<void>;
};

const BUTTON = 'inline-flex items-center justify-center rounded-full px-6 py-2.5 text-xs font-medium uppercase tracking-[0.14em] transition-colors disabled:cursor-not-allowed disabled:opacity-60';

// Janela de confirmação do painel, no mesmo estilo das de excluir códigos/acessos.
// Fecha com Esc, clicando fora ou em "Cancelar"; enquanto a ação roda, os botões ficam travados.
export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!request) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isRunning) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, isRunning, onClose]);

  if (!request) return null;

  const confirm = async () => {
    setIsRunning(true);
    try {
      await request.onConfirm();
    } finally {
      setIsRunning(false);
      onClose();
    }
  };

  const tone = request.tone ?? 'primary';

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="admin-confirm-title"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm"
      onClick={() => (isRunning ? undefined : onClose())}
    >
      <div
        className="w-full max-w-md rounded-[2rem] border border-zinc-800/10 bg-[#fffaf1] p-6 shadow-2xl sm:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70">{request.eyebrow ?? 'Confirmar ação'}</p>
        <h3 id="admin-confirm-title" className="mt-2 font-display text-4xl italic leading-none text-zinc-800">
          {request.title}
        </h3>
        <div className="mt-3 text-sm text-zinc-700">{request.message}</div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isRunning}
            className={`${BUTTON} border border-zinc-800/20 text-zinc-800 hover:bg-zinc-800/5`}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={isRunning}
            autoFocus
            className={`${BUTTON} ${
              tone === 'danger'
                ? 'border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100'
                : 'bg-champagne-600 text-[#fff9f1] hover:opacity-90'
            }`}
          >
            {isRunning ? 'Aguarde…' : request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
