"use client";

import { useEffect, useState } from 'react';

type AdminIdentityData = { role: 'noivo' | 'noiva'; name: string };

/** Gravata (noivo). */
function TieIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path d="M9 2h6l-1.4 4.2h-3.2L9 2Z" fill="currentColor" />
      <path d="M10.4 7.4h3.2l2.6 10.1L12 22l-4.2-4.5 2.6-10.1Z" fill="currentColor" />
    </svg>
  );
}

/** Laço (noiva). */
function BowIcon() {
  return (
    <svg viewBox="0 0 28 24" className="h-5 w-6" aria-hidden="true">
      <path d="M12 10.5C9.5 6 3.5 3.5 2 5.5c-1.5 2 .2 9 2.7 10.2 2.4 1.1 6.3-1.3 7.3-3.2v-2Z" fill="currentColor" />
      <path d="M16 10.5c2.5-4.5 8.5-7 10-5 1.5 2-.2 9-2.7 10.2-2.4 1.1-6.3-1.3-7.3-3.2v-2Z" fill="currentColor" />
      <path d="M12.5 13.5 9.5 22l2.4-1.2 1.2 2.2 1-8.5h-1.6Zm3 0 3 8.5-2.4-1.2-1.2 2.2-1-8.5h1.6Z" fill="currentColor" opacity="0.85" />
      <rect x="11.3" y="8.7" width="5.4" height="5.6" rx="2.2" fill="currentColor" />
    </svg>
  );
}

// Topo do painel: ícone de quem está logado (gravata para o noivo, laço para a noiva) e o nome.
export function AdminIdentity() {
  const [admin, setAdmin] = useState<AdminIdentityData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/me', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data?.admin) setAdmin(data.admin);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!admin) return null;
  const isGroom = admin.role === 'noivo';
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 shadow-[0_6px_16px_rgba(150,110,45,0.2)] ${
          isGroom ? 'border-[#d6b46e] bg-zinc-900 text-[#f3e2b8]' : 'border-[#d6b46e] bg-[#fbe9ee] text-[#c97a8a]'
        }`}
        aria-hidden="true"
      >
        {isGroom ? <TieIcon /> : <BowIcon />}
      </span>
      <div className="leading-tight">
        <p className="font-display text-2xl text-zinc-800">Olá, {admin.name}</p>
        <p className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-champagne-600">{isGroom ? 'Noivo' : 'Noiva'}</p>
      </div>
    </div>
  );
}
