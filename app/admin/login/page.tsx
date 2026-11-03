"use client";

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Enquanto o login está bloqueado por excesso de tentativas, o botão fica travado até este horário.
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!lockedUntil) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= lockedUntil) {
        setLockedUntil(null);
        setError('');
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  const isLocked = lockedUntil !== null && now < lockedUntil;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLocked) return;

    if (!username.trim() || !password) {
      setError('Informe o usuário e a senha.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        if (response.status === 429 && typeof data?.lockedMinutes === 'number') {
          setLockedUntil(Date.now() + data.lockedMinutes * 60_000);
          setNow(Date.now());
        }
        throw new Error(data?.error || 'Falha ao autenticar no painel admin.');
      }

      setPassword('');
      router.replace('/admin');
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Erro inesperado.';
      setError(message);
      setPassword('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-cream px-4 py-10 text-zinc-800">
      <section className="rounded-[2rem] border border-zinc-800/10 bg-[#fffaf1] p-6 shadow-[0_24px_60px_rgba(47,36,27,0.08)] sm:p-8 w-full max-w-md text-center">
        <div className="space-y-2 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70">Área administrativa</p>
          <h1 className="mt-2 font-display text-5xl italic leading-none text-zinc-800">Igor & Bianca</h1>
          <p className="text-sm text-zinc-700">Entre para gerenciar códigos e acessos.</p>
        </div>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="admin-username" className="sr-only">
              Usuário
            </label>
            <input
              id="admin-username"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              value={username}
              disabled={isLocked}
              onChange={(event) => {
                setUsername(event.target.value);
                if (!isLocked) setError('');
              }}
              className="w-full rounded-xl border border-zinc-800/15 bg-cream px-5 py-3 text-sm text-zinc-800 placeholder:text-zinc-500 focus:border-champagne-600 focus:outline-none focus:ring-2 focus:ring-champagne-600/20 disabled:opacity-60"
              placeholder="Usuário"
            />
          </div>
          <div className="relative">
            <label htmlFor="admin-password" className="sr-only">
              Senha do administrador
            </label>
            <input
              id="admin-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              disabled={isLocked}
              onChange={(event) => {
                setPassword(event.target.value);
                if (!isLocked) setError('');
              }}
              className="w-full rounded-xl border border-zinc-800/15 bg-cream py-3 pl-5 pr-24 text-sm text-zinc-800 placeholder:text-zinc-500 focus:border-champagne-600 focus:outline-none focus:ring-2 focus:ring-champagne-600/20 disabled:opacity-60"
              placeholder="Senha"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 px-4 text-xs font-medium uppercase tracking-[0.14em] text-zinc-600 hover:text-zinc-900"
            >
              {showPassword ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>

          {error ? (
            <p role="alert" className="text-xs text-rose-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isLoading || isLocked}
            className="inline-flex items-center justify-center rounded-full bg-champagne-600 px-8 py-3.5 text-xs font-medium uppercase tracking-[0.2em] text-[#fff9f1] transition-transform duration-500 ease-[cubic-bezier(0.22,0.72,0.36,1)] hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 w-full"
          >
            {isLoading ? 'Entrando...' : isLocked ? 'Aguarde para tentar de novo' : 'Acessar painel'}
          </button>
        </form>

        <p className="mt-6 text-xs text-zinc-500">Por segurança, a sessão expira após 2 horas sem uso.</p>
      </section>
    </main>
  );
}
