"use client";

import { useEffect, useState } from 'react';
import { isStaleVersionError, reloadOnce } from '@/lib/error-recovery';

// Erro no layout principal (fora das páginas): substitui o documento inteiro, por isso tem <html> e <body>
// próprios e estilos simples (as fontes e o CSS do site podem não ter carregado).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    console.error('Erro no site', error);
    if (isStaleVersionError(error) && reloadOnce()) setReloading(true);
  }, [error]);

  const button = {
    borderRadius: 999,
    padding: '12px 28px',
    fontSize: 12,
    letterSpacing: '0.2em',
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
  };

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: '#f8f1e4', color: '#2f241b', fontFamily: 'Georgia, serif' }}>
        <main style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div role="alert" style={{ maxWidth: 420, width: '100%', background: '#fffaf1', borderRadius: 32, padding: 32, textAlign: 'center', border: '1px solid rgba(47,36,27,0.1)' }}>
            <p style={{ fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', margin: 0 }}>Igor &amp; Bianca</p>
            <h1 style={{ fontStyle: 'italic', fontWeight: 400, fontSize: 36, margin: '8px 0 0' }}>{reloading ? 'Atualizando…' : 'Ops, algo falhou'}</h1>
            <p style={{ fontSize: 14, color: '#6b5f55', marginTop: 16 }}>
              {reloading ? 'O site acabou de ganhar uma versão nova. Só um instante.' : 'O site não carregou direito. Tente de novo.'}
            </p>
            {reloading ? null : (
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 24 }}>
                <button type="button" onClick={reset} style={{ ...button, border: 'none', background: '#9a6a3a', color: '#fff9f1' }}>
                  Tentar de novo
                </button>
                <button type="button" onClick={() => window.location.reload()} style={{ ...button, border: '1px solid rgba(47,36,27,0.2)', background: 'transparent', color: '#2f241b' }}>
                  Recarregar
                </button>
              </div>
            )}
          </div>
        </main>
      </body>
    </html>
  );
}
