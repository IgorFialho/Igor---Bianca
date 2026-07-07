"use client";

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!password.trim()) {
      setError('Informe a senha de administrador.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.error || 'Falha ao autenticar no painel admin.');
      }

      router.push('/admin');
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Erro inesperado.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="paper-texture relative flex min-h-screen items-center justify-center px-4 py-10">
      <section className="frosted-light gold-frame w-full max-w-md rounded-2xl p-6 sm:p-8">
        <div className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.34em] text-zinc-600">Area administrativa</p>
          <h1 className="font-display text-4xl text-champagne-800">Igor & Bianca</h1>
          <p className="text-sm text-zinc-700">Entre para gerenciar codigos e acessos.</p>
        </div>

        <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError('');
            }}
            className="focus-gold w-full rounded-lg border border-zinc-200/90 bg-white/85 px-3 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-500"
            placeholder="Senha do administrador"
          />

          {error ? <p className="text-xs text-rose-700">{error}</p> : null}

          <button
            type="submit"
            disabled={isLoading}
            className="shimmer-button w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-zinc-900 disabled:opacity-70"
          >
            {isLoading ? 'Entrando...' : 'Acessar painel'}
          </button>
        </form>
      </section>
    </main>
  );
}
