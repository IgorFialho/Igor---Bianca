"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { InviteDetails } from '@/components/invite-details';
import { RsvpForm } from '@/components/rsvp-form';
import { INVITE_ACCESS_KEY } from '@/lib/invite';

export default function RsvpPage() {
  const router = useRouter();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  useEffect(() => {
    const storedAccess = window.sessionStorage.getItem(INVITE_ACCESS_KEY);

    if (!storedAccess) {
      router.replace('/login');
      setHasAccess(false);
      return;
    }

    setHasAccess(true);
  }, [router]);

  if (hasAccess !== true) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 text-sm uppercase tracking-[0.35em] text-zinc-600/80">
        Verificando acesso...
      </main>
    );
  }

  return (
    <main className="paper-texture relative min-h-screen px-4 py-5 sm:px-6 sm:py-8 lg:px-10">
      <section className="mx-auto w-full max-w-7xl space-y-4">
        <header className="frosted-light gold-frame rounded-2xl p-5 text-center sm:p-6">
          <p className="text-xs uppercase tracking-[0.35em] text-zinc-600">RSVP</p>
          <h1 className="mt-2 font-display text-4xl text-champagne-800 sm:text-5xl">
            Confirme Sua Presenca
          </h1>
          <p className="mt-2 text-sm text-zinc-700/85">
            Sua resposta ajuda a preparar cada detalhe deste dia especial.
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <section className="wildflower-backdrop relative overflow-hidden rounded-[1.2rem] p-4 sm:p-6 lg:p-8">
            <div className="absolute inset-0 bg-gradient-to-br from-white/28 via-transparent to-zinc-800/20" />
            <InviteDetails />
          </section>

          <section className="wildflower-backdrop relative overflow-hidden rounded-[1.2rem] p-4 sm:p-6 lg:p-8">
            <div className="absolute inset-0 bg-gradient-to-br from-white/28 via-transparent to-zinc-800/20" />
            <div className="relative z-10">
              <RsvpForm />
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
