"use client";

import { useEffect, useState } from 'react';
import { isStaleVersionError, reloadOnce } from '@/lib/error-recovery';

// Tela de erro das páginas: em vez da tela branca do Next.js ("Application error"), um cartão no estilo do site.
// Versão antiga do site (depois de um novo deploy): recarrega sozinho e já abre a versão nova.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    console.error('Erro na página', error);
    if (isStaleVersionError(error) && reloadOnce()) setReloading(true);
  }, [error]);

  return (
    <main className="flex min-h-[70svh] items-center justify-center px-4 py-16">
      <div role="alert" className="w-full max-w-md rounded-[2rem] border border-zinc-800/10 bg-[#fffaf1] p-6 text-center shadow-[0_24px_60px_rgba(47,36,27,0.12)] sm:p-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/80">Igor &amp; Bianca</p>
        <h1 className="mt-2 font-display text-4xl italic leading-none text-zinc-800">{reloading ? 'Atualizando…' : 'Ops, algo falhou'}</h1>
        <p className="mt-4 text-sm text-zinc-600">
          {reloading
            ? 'O site acabou de ganhar uma versão nova. Só um instante.'
            : 'Esta parte do site não carregou direito. Tente de novo; se continuar, recarregue a página.'}
        </p>
        {reloading ? null : (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-champagne-600 px-8 py-3 text-xs font-medium uppercase tracking-[0.2em] text-[#fff9f1]"
            >
              Tentar de novo
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-zinc-800/20 px-8 py-3 text-xs font-medium uppercase tracking-[0.2em] text-zinc-800 hover:bg-zinc-800/5"
            >
              Recarregar
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
