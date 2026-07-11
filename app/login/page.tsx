"use client";

import { AnimatePresence, motion } from 'framer-motion';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { INVITE_ACCESS_KEY } from '@/lib/invite';

const EVENT_DATE = new Date('2027-04-18T16:30:00-03:00');

function getCountdown() {
  const now = new Date();
  const diff = Math.max(0, EVENT_DATE.getTime() - now.getTime());

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  return { days, hours, minutes, seconds };
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

type PublicRsvpMessage = {
  id: string;
  guestName: string;
  message: string;
  submittedAt: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [hasOpenedExperience, setHasOpenedExperience] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState<ReturnType<typeof getCountdown> | null>(null);
  const [rsvpMessages, setRsvpMessages] = useState<PublicRsvpMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const petals = useMemo(
    () =>
      Array.from({ length: 20 }, (_, index) => ({
        id: index,
        left: `${(index * 9 + 5) % 100}%`,
        delay: index * 0.18,
        duration: 7 + (index % 5),
        size: 8 + (index % 4) * 2,
      })),
    [],
  );

  const sparkles = useMemo(
    () =>
      Array.from({ length: 24 }, (_, index) => ({
        id: index,
        left: `${(index * 13 + 8) % 100}%`,
        top: `${(index * 7 + 12) % 100}%`,
        delay: index * 0.16,
        duration: 4 + (index % 4),
      })),
    [],
  );

  useEffect(() => {
    setCountdown(getCountdown());

    const timer = window.setInterval(() => {
      setCountdown(getCountdown());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadMessages = async (showLoader = false) => {
      if (showLoader && isMounted) {
        setIsLoadingMessages(true);
      }

      try {
        const response = await fetch(`/api/rsvp?messages=yes&t=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || 'Falha ao carregar mensagens.');
        }

        if (isMounted) {
          setRsvpMessages(Array.isArray(data?.messages) ? data.messages : []);
        }
      } catch {
        if (isMounted) {
          setRsvpMessages([]);
        }
      } finally {
        if (isMounted) {
          setIsLoadingMessages(false);
        }
      }
    };

    const refreshMessages = () => {
      void loadMessages(false);
    };

    void loadMessages(true);
    const intervalId = window.setInterval(refreshMessages, 15000);
    window.addEventListener('focus', refreshMessages);
    document.addEventListener('visibilitychange', refreshMessages);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshMessages);
      document.removeEventListener('visibilitychange', refreshMessages);
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedCode = inviteCode.trim();

    if (!trimmedCode) {
      setError('Informe o código do convite para continuar.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/invite/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: trimmedCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Codigo invalido. Confira o convite e tente novamente.');
      }

      window.sessionStorage.setItem(INVITE_ACCESS_KEY, data.code || trimmedCode);
      router.push('/convite');
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Erro inesperado.';
      setError(message);
      setIsSubmitting(false);
    }
  };

  const countdownValues = countdown ?? { days: 0, hours: 0, minutes: 0, seconds: 0 };
  const googleMapsUrl = 'https://www.google.com/maps/search/?api=1&query=Av.+Otacilio+Negrao+de+Lima,+7630+-+Pampulha,+Belo+Horizonte+-+MG,+31365-450';
  const googleMapsEmbedUrl = 'https://www.google.com/maps?q=Av.+Otacilio+Negrao+de+Lima,+7630+-+Pampulha,+Belo+Horizonte+-+MG,+31365-450&output=embed';
  const navItems = [
    { label: 'Home', href: '#home' },
    { label: 'O Casal', href: '#o-casal' },
    { label: 'Cerimonia', href: '#cerimonia' },
    { label: 'RSVP', href: '#rsvp' },
  ];

  return (
    <main className="paper-texture relative min-h-screen overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('/imagens/flores.jpg')",
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(255,255,255,0.3),transparent_34%),radial-gradient(circle_at_86%_86%,rgba(13,10,7,0.34),transparent_40%),linear-gradient(180deg,rgba(20,14,10,0.2),rgba(20,14,10,0.34))]" />

      <section className="relative z-10 mx-auto grid min-h-screen w-full max-w-7xl gap-4 px-4 py-5 sm:px-6 sm:py-8 lg:px-10">
        <div className="relative overflow-hidden p-0 sm:p-2 lg:p-4">

          <nav className="gold-frame fixed left-1/2 top-2 z-40 flex w-[calc(100%-1rem)] max-w-5xl -translate-x-1/2 flex-col gap-2 rounded-xl bg-white/65 px-3 py-2 text-[0.62rem] uppercase tracking-[0.18em] text-zinc-700 backdrop-blur-md sm:top-4 sm:w-[calc(100%-3rem)] sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 sm:text-[0.68rem]">
            <div className="flex w-full items-center justify-start gap-2 overflow-x-auto pb-0.5 text-[0.6rem] sm:hidden">
              {navItems.map((item) => (
                <a
                  key={`mobile-${item.href}`}
                  href={item.href}
                  className="flex-shrink-0 whitespace-nowrap rounded-full border border-champagne-500/35 bg-white/45 px-2.5 py-1 text-zinc-700 transition-colors hover:bg-white/75"
                >
                  {item.label}
                </a>
              ))}
            </div>

            <div className="hidden items-center gap-5 sm:flex">
              {navItems.map((item) => (
                <a key={item.href} href={item.href} className="transition-colors hover:text-zinc-900">
                  {item.label}
                </a>
              ))}
            </div>
          </nav>

          <div className="pointer-events-none absolute inset-0">
            {petals.map((petal) => (
              <motion.span
                key={petal.id}
                className="absolute rounded-full bg-gradient-to-br from-teaRose-200/80 to-teaRose-300/60"
                style={{ left: petal.left, top: '-12%', width: petal.size, height: petal.size * 0.7 }}
                initial={{ opacity: 0, rotate: 0, y: -20 }}
                animate={{ opacity: [0, 0.55, 0.38, 0], rotate: [0, 120, 240], y: ['-6vh', '110vh'] }}
                transition={{
                  duration: petal.duration,
                  delay: petal.delay,
                  repeat: Infinity,
                  ease: 'linear',
                }}
              />
            ))}
            {sparkles.map((particle) => (
              <motion.span
                key={particle.id}
                className="absolute h-1 w-1 rounded-full bg-champagne-500/75"
                style={{ left: particle.left, top: particle.top }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.9, 0.2, 0], y: [-4, 4, -2], x: [-2, 2, 0] }}
                transition={{
                  duration: particle.duration,
                  delay: particle.delay,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>

          <section
            id="home"
            className="relative z-10 mx-auto mt-40 w-full max-w-5xl scroll-mt-32 overflow-hidden rounded-[1.3rem] border border-white/45 bg-cover bg-center bg-no-repeat p-4 sm:mt-24 sm:scroll-mt-28 sm:p-8"
            style={{
              backgroundImage: "url('/imagens/flores.jpg')",
            }}
          >
            <div className="pointer-events-none absolute inset-0 bg-white/62" />
            <header className="space-y-4 text-center">
              <div className="mx-auto flex w-fit items-center gap-4">
                <img
                  src="/imagens/casal.jpeg"
                  alt="Igor e Bianca"
                  className="h-24 w-24 rounded-[50%] border-2 border-white/85 object-cover shadow-[0_10px_24px_rgba(0,0,0,0.18)] sm:h-28 sm:w-28"
                />
              </div>
              <h1 className="font-display text-4xl leading-[1.0] text-champagne-800 sm:text-6xl">Igor e Bianca</h1>
              <p className="text-xs uppercase tracking-[0.35em] text-zinc-700/85 sm:text-sm">18 | 04 | 2027</p>
            </header>

            <section className="mx-auto mt-7 max-w-3xl rounded-2xl border border-white/55 bg-white/55 p-4 text-center sm:p-5">
              <p className="text-[0.64rem] uppercase tracking-[0.35em] text-zinc-600 sm:text-xs">Nosso grande dia</p>
              <h2 className="mt-1 font-display text-2xl leading-none text-champagne-800 sm:text-3xl">Contagem para o casamento</h2>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                <div className="gold-frame rounded-lg bg-white/75 px-2 py-3">
                  <p className="font-display text-3xl text-champagne-800 sm:text-4xl">{countdownValues.days}</p>
                  <p className="mt-1 text-[0.62rem] uppercase tracking-[0.22em] text-zinc-600">Dias</p>
                </div>
                <div className="gold-frame rounded-lg bg-white/75 px-2 py-3">
                  <p className="font-display text-3xl text-champagne-800 sm:text-4xl">{pad(countdownValues.hours)}</p>
                  <p className="mt-1 text-[0.62rem] uppercase tracking-[0.22em] text-zinc-600">Horas</p>
                </div>
                <div className="gold-frame rounded-lg bg-white/75 px-2 py-3">
                  <p className="font-display text-3xl text-champagne-800 sm:text-4xl">{pad(countdownValues.minutes)}</p>
                  <p className="mt-1 text-[0.62rem] uppercase tracking-[0.22em] text-zinc-600">Minutos</p>
                </div>
                <div className="gold-frame rounded-lg bg-white/75 px-2 py-3">
                  <p className="font-display text-3xl text-champagne-800 sm:text-4xl">{pad(countdownValues.seconds)}</p>
                  <p className="mt-1 text-[0.62rem] uppercase tracking-[0.22em] text-zinc-600">Segundos</p>
                </div>
              </div>
            </section>

            <section
              id="o-casal"
              className="mx-auto mt-7 max-w-3xl scroll-mt-28 overflow-hidden rounded-2xl border border-white/55 bg-white/60 p-4 text-center sm:p-5"
            >
              <p className="text-[0.64rem] uppercase tracking-[0.3em] text-zinc-600">O Casal</p>
              <h3 className="mt-2 font-display text-3xl text-champagne-800 sm:text-4xl">Uma historia de amor</h3>

              <div className="mx-auto mt-4 max-w-2xl overflow-hidden rounded-xl border border-white/70 bg-white/75 p-2">
                <img
                  src="/imagens/casal-fundo.jpeg"
                  alt="Igor e Bianca"
                  className="h-56 w-full rounded-lg object-cover sm:h-72"
                />
              </div>

              <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-zinc-700 sm:text-base">
                Igor e Bianca celebram um novo capitulo ao lado das pessoas que mais amam.
                Cada detalhe deste dia foi preparado com carinho para vivermos juntos um momento inesquecivel.
              </p>
            </section>

            <section id="cerimonia" className="mx-auto mt-7 max-w-3xl scroll-mt-28 rounded-2xl border border-white/55 bg-white/60 p-4 sm:p-5">
              <p className="text-center text-[0.64rem] uppercase tracking-[0.3em] text-zinc-600">Cerimonia</p>
              <h3 className="mt-2 text-center font-display text-3xl text-champagne-800 sm:text-4xl">Informacoes da Cerimonia</h3>
              <div className="mt-4 grid gap-2 text-sm text-zinc-700 sm:grid-cols-2 sm:gap-3 sm:text-base">
                <div className="gold-frame rounded-lg bg-white/70 px-3 py-2.5">
                  <p className="text-[0.62rem] uppercase tracking-[0.2em] text-zinc-500">Data</p>
                  <p className="mt-1 font-medium">18 de Abril de 2027</p>
                </div>
                <div className="gold-frame rounded-lg bg-white/70 px-3 py-2.5">
                  <p className="text-[0.62rem] uppercase tracking-[0.2em] text-zinc-500">Horario</p>
                  <p className="mt-1 font-medium">16h30</p>
                </div>
                <div className="gold-frame rounded-lg bg-white/70 px-3 py-2.5 sm:col-span-2">
                  <p className="text-[0.62rem] uppercase tracking-[0.2em] text-zinc-500">Local</p>
                  <p className="mt-1 font-medium">Pampulha - Belo Horizonte</p>
                  <p className="mt-1 text-xs text-zinc-600 sm:text-sm">Av. Otacílio Negrão de Lima, 7630 - Pampulha, Belo Horizonte - MG, 31365-450</p>
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex rounded-full border border-champagne-500/45 bg-white/70 px-3 py-1 text-[0.62rem] uppercase tracking-[0.18em] text-zinc-700 transition-colors hover:bg-white"
                  >
                    Abrir no Google Maps
                  </a>
                </div>
              </div>

              <div className="gold-frame mt-3 overflow-hidden rounded-xl border-white/55 bg-white/70">
                <iframe
                  title="Mapa da cerimonia"
                  src={googleMapsEmbedUrl}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="h-52 w-full sm:h-64"
                />
              </div>
            </section>

            <AnimatePresence mode="wait">
              {!hasOpenedExperience ? (
                <motion.article
                  key="letter-preview"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10, filter: 'blur(8px)' }}
                  transition={{ duration: 0.55, ease: 'easeOut' }}
                  className="relative mx-auto mt-7 max-w-3xl"
                >
                  <div className="gold-frame absolute inset-x-4 top-4 h-[92%] rounded-2xl bg-[#f7f2e8]/95" />
                  <div className="gold-frame relative rounded-2xl bg-[linear-gradient(180deg,#fffef9_0%,#f8f1e6_100%)] p-6 text-center shadow-[0_18px_45px_rgba(64,45,26,0.18)] sm:p-8">
                    <div className="absolute right-5 top-5 h-10 w-10 rounded-full border border-[#b57562]/45 bg-[radial-gradient(circle_at_30%_30%,#d48c73_0%,#b56e59_72%)] shadow-inner" />
                    <p className="text-[0.66rem] uppercase tracking-[0.3em] text-zinc-600">Carta de boas-vindas</p>
                    <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-zinc-700 sm:text-base">
                      Criamos este convite para compartilhar com voce os detalhes do nosso casamento.
                      Estamos muito felizes e contamos com sua presenca no nosso grande dia.
                    </p>
                    <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-zinc-700 sm:text-base">
                      Ah, e importante confirmar sua presenca. Basta abrir a carta e inserir seu codigo
                      de convite para continuar.
                    </p>
                    <p className="mt-5 font-display text-2xl text-champagne-700 sm:text-3xl">Com amor, Igor e Bianca</p>

                    <div className="mt-6 space-y-3">
                      <p className="text-xs uppercase tracking-[0.32em] text-zinc-700/80">Clique para abrir o Convite</p>
                      <button
                        type="button"
                        onClick={() => setHasOpenedExperience(true)}
                        className="shimmer-button rounded-xl px-7 py-3 text-sm font-semibold text-zinc-900 transition-transform duration-300 hover:-translate-y-0.5"
                      >
                        Acessar Convite
                      </button>
                    </div>
                  </div>
                </motion.article>
              ) : (
                <motion.article
                  id="rsvp"
                  key="login-card"
                  initial={{ opacity: 0, y: 20, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.55, ease: 'easeOut' }}
                  className="frosted-light gold-frame relative mx-auto mt-7 w-full max-w-md scroll-mt-28 rounded-[1.3rem] p-5 sm:p-6"
                >
                  <div className="space-y-2 text-center">
                    <h2 className="font-display text-3xl leading-[0.98] text-champagne-800 sm:text-[3.2rem]">
                      Seja Bem-vindo ao
                      <br />
                      Nosso Dia Especial
                    </h2>
                    <p className="mx-auto max-w-sm text-sm leading-5 text-zinc-700">
                      Por favor, insira o codigo do seu convite
                    </p>
                  </div>

                  <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
                    <input
                      id="inviteCode"
                      type="text"
                      value={inviteCode}
                      onChange={(event) => {
                        setInviteCode(event.target.value);
                        setError('');
                      }}
                      className="focus-gold w-full rounded-lg border border-zinc-200/90 bg-white/85 px-3 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-500"
                      placeholder="Codigo do Convite"
                      autoComplete="off"
                    />
                    {error ? <p className="text-xs text-rose-700">{error}</p> : null}

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="shimmer-button w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-zinc-900 transition-all duration-300 hover:-translate-y-[1px] disabled:cursor-wait disabled:opacity-70"
                    >
                      {isSubmitting ? 'Entrando...' : 'Acessar Convite'}
                    </button>
                  </form>
                </motion.article>
              )}
            </AnimatePresence>

            <section className="mx-auto mt-7 w-full max-w-3xl rounded-2xl border border-white/55 bg-white/60 p-4 sm:p-5">
              <div className="text-center">
                <p className="text-[0.64rem] uppercase tracking-[0.3em] text-zinc-600">RSVP</p>
                <h3 className="mt-2 font-display text-3xl text-champagne-800 sm:text-4xl">Mensagens deixadas pelos convidados</h3>
              </div>

              {isLoadingMessages ? (
                <p className="mt-4 text-center text-sm text-zinc-600">Carregando mensagens...</p>
              ) : null}

              {!isLoadingMessages && rsvpMessages.length === 0 ? (
                <p className="mt-4 text-center text-sm text-zinc-600">Ainda nao ha mensagens de confirmacao com recados.</p>
              ) : null}

              {!isLoadingMessages && rsvpMessages.length > 0 ? (
                <div className="mt-4 grid gap-3">
                  {rsvpMessages.map((entry) => (
                    <article key={entry.id} className="gold-frame rounded-xl bg-white/75 p-3 sm:p-4">
                      <p className="font-display text-2xl text-champagne-800 break-words [overflow-wrap:anywhere]">{entry.guestName}</p>
                      <p className="mt-2 text-sm leading-6 text-zinc-700 break-words [overflow-wrap:anywhere]">{entry.message}</p>
                      <p className="mt-3 text-[0.62rem] uppercase tracking-[0.16em] text-zinc-500">
                        {new Date(entry.submittedAt).toLocaleDateString('pt-BR')}
                      </p>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          </section>
        </div>
      </section>

      <footer className="relative z-10 mt-2 pb-4 text-center text-xs text-zinc-100/90">
       © Desenvolvido por <a href="https://github.com/IgorFialho" target="_blank" rel="noopener noreferrer" className="font-semibold text-white-800 underline">Igor Fialho</a>
      </footer>
    </main>
  );
}
