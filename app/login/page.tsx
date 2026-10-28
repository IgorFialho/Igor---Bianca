"use client";

import { motion } from 'framer-motion';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { INVITE_ACCESS_KEY } from '@/lib/invite';
import { FittedText } from '@/components/home/fitted-text';
import { Hero, type HeroPhoto } from '@/components/home/hero';
import { Reveal, REVEAL_EASE } from '@/components/home/reveal';
import { ScrollWords } from '@/components/home/scroll-words';
import { SiteHeader } from '@/components/home/site-header';
import { StoryScroll, type StoryChapter } from '@/components/home/story-scroll';
import { ClickPetals } from '@/components/home/click-petals';
import { DetailsSection, type GuestMessage } from '@/components/home/details-section';
import { FaqSection, type FaqItem } from '@/components/home/faq-section';
import { FlowerConfetti } from '@/components/home/flower-confetti';
import { FooterCarousel, type FooterPhoto } from '@/components/home/footer-carousel';
import { VenueCarousel, type VenuePhoto } from '@/components/home/venue-carousel';
import { useSectionBackground, type SectionBackground } from '@/components/home/use-section-background';

const EVENT_DATE = new Date('2027-04-18T16:30:00-03:00');

// Textos e fotos da página. Os textos dos capítulos são provisórios: troque pelos de vocês.
// Cada foto do casal (public/imagens/casal) aparece uma única vez na página.
const HERO_PHOTO = '/imagens/casal/pedido.jpeg';
// Foto do pedido nas montanhas; o foco mantém o casal no centro da intro.
const HERO_PHOTO_POSITION = '52% 62%';
// Onde o casal está na foto (frações): na introdução, a foto se ajusta para eles aparecerem de corpo inteiro no arco.
const HERO_COUPLE = { centerX: 0.525, centerY: 0.675, width: 0.32, height: 0.46 };
// Fotos que aparecem em volta da principal ao rolar o topo (esquerda: 1 e 2; direita: 3 e 4).
const HERO_GALLERY: [HeroPhoto, HeroPhoto, HeroPhoto, HeroPhoto] = [
  { src: '/imagens/casal/casal-01.jpeg' },
  { src: '/imagens/casal/casal-02.jpeg' },
  { src: '/imagens/casal/casal-10.jpeg' },
  { src: '/imagens/casal/casal-11.jpeg' },
];
// Carrossel do rodapé (troca a cada 8s): o jardim do convite (Roman Odintsov / Pexels), a foto do casal
// que não aparece no resto da home, a parede de rosas (karaz flowers / Unsplash) e as flores do Save the Date.
const FOOTER_PHOTOS: FooterPhoto[] = [
  { src: '/imagens/convite/jardim-fundo.jpg', mobileSrc: '/imagens/convite/jardim-fundo-mobile.jpg', position: '50% 60%', quote: 'o nosso para sempre fica ainda mais bonito com vocês ao nosso lado.' },
  { src: '/imagens/casal.jpeg', quote: 'você é a minha pessoa favorita para viver todos os capítulos da vida.' },
  { src: '/imagens/convite/rosas-fundo.jpg', mobileSrc: '/imagens/convite/rosas-fundo-mobile.jpg', position: '50% 50%', quote: 'o amor floresce quando é cultivado todos os dias.' },
  { src: '/imagens/convite/flores-fundo.jpg', mobileSrc: '/imagens/convite/flores-fundo-mobile.jpg', position: '50% 60%', quote: 'obrigado por fazerem parte da nossa história. nos vemos no grande dia!' },
];

const STORY_CHAPTERS: StoryChapter[] = [
  {
    title: 'capítulo um: como nos conhecemos',
    text: 'O começo de tudo: o dia em que nossos caminhos se cruzaram e uma conversa virou muitas outras.',
    photos: [
      { src: '/imagens/casal/casal-12.jpeg', caption: 'O começo de tudo' },
      { src: '/imagens/casal/casal-13.jpeg', caption: 'Primeiros passeios' },
      { src: '/imagens/casal/casal-03.jpeg', caption: 'Juntos' },
    ],
  },
  {
    title: 'capítulo dois: nos apaixonando',
    text: 'Jantares, viagens, rotinas compartilhadas e todos os pequenos momentos que fizeram a vida parecer maior.',
    photos: [
      { src: '/imagens/casal/casal-06.jpeg', caption: 'Pampulha' },
      { src: '/imagens/casal/casal-09.jpeg', caption: 'Flores e carinho' },
      { src: '/imagens/casal/casal-07.jpeg', caption: 'Nossas aventuras' },
    ],
  },
  {
    title: 'capítulo três: o próximo passo',
    text: 'Uma pergunta, um sim muito fácil, e de repente o futuro que imaginávamos virou algo para celebrar com vocês.',
    photos: [
      { src: '/imagens/casal/casal-04.jpeg', caption: 'O pedido' },
      { src: '/imagens/casal/casal-05.jpeg', caption: 'Sim!' },
    ],
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Como confirmo minha presença?',
    answer:
      'Digite o código do seu convite na seção "Confirme sua presença" e responda no envelope que vai abrir.\n\nSe preferir, você também pode deixar uma mensagem para os noivos.',
  },
  {
    question: 'Que horas devo chegar?',
    answer: 'A cerimônia começa às 16h30. Recomendamos chegar cerca de 15 minutos antes para que todos possam se acomodar com calma.',
  },
  {
    question: 'Onde será o casamento?',
    answer: 'Na Pampulha, em Belo Horizonte: Av. Otacílio Negrão de Lima, 7630 - Pampulha, Belo Horizonte - MG, 31365-450.',
  },
  {
    question: 'Posso levar acompanhante ou crianças?',
    answer:
      'Cada convite é nominal: ao confirmar presença com o seu código, aparecem exatamente as pessoas incluídas no seu convite.\n\nEm caso de dúvida, fale diretamente com a gente.',
  },
  {
    question: 'Já confirmei, mas preciso mudar minha resposta. E agora?',
    answer: 'Depois de enviada, a resposta fica registrada no convite. Se precisar alterar, entre em contato com os noivos.',
  },
];

// Cores de fundo da página por seção (como na Cordially): a contagem regressiva ganha o tom areia,
// que segue na seção do local, e o fundo volta ao creme na confirmação de presença. Troca suave (0,5s).
const PAGE_BACKGROUND = '#fcf7ed';
const SECTION_BACKGROUNDS: SectionBackground[] = [
  { id: 'cerimonia', color: '#f6edd7' },
  { id: 'rsvp', color: PAGE_BACKGROUND },
];

const NAV_LINKS = [
  { label: 'Nossa história', href: '#nossa-historia' },
  { label: 'Cerimônia', href: '#cerimonia' },
  { label: 'Confirmar presença', href: '#rsvp' },
  { label: 'Mensagens', href: '#mensagens' },
  { label: 'Perguntas', href: '#perguntas' },
];

// Local da cerimônia. Fotos do site oficial do Recanto Pampulha (álbum do Flickr e fundos do site, clareados), trocando
// sozinhas a cada 5s; o foco mais alto deixa a marca d'água do canto inferior fora do recorte 21:9.
const VENUE_NAME = 'Recanto Pampulha';
const VENUE_ADDRESS = 'Av. Otacílio Negrão de Lima, 7630 - Pampulha, Belo Horizonte - MG, 31365-450';
const VENUE_PHOTOS: VenuePhoto[] = [
  { src: '/imagens/recanto/recanto-01.jpg', alt: 'Casa sede do Recanto Pampulha vista do gramado', position: '50% 38%' },
  { src: '/imagens/recanto/recanto-02.jpg', alt: 'Altar da cerimônia no jardim, com passarela de madeira, bancos e varal de luzes', position: '50% 56%' },
  { src: '/imagens/recanto/recanto-03.jpg', alt: 'Vista aérea da casa e do jardim', position: '50% 50%' },
  { src: '/imagens/recanto/recanto-04.jpg', alt: 'Varanda decorada para a festa', position: '50% 38%' },
  { src: '/imagens/recanto/recanto-05.jpg', alt: 'Bolo de casamento com flores', position: '50% 45%' },
];
const GOOGLE_MAPS_URL =
  'https://www.google.com/maps/search/?api=1&query=Av.+Otacilio+Negrao+de+Lima,+7630+-+Pampulha,+Belo+Horizonte+-+MG,+31365-450';

// Espaçamento lateral e vertical padrão das seções de conteúdo.
const SECTION = 'relative w-full px-6 py-24 md:px-12 md:py-32';
const HEADING = 'font-display text-[3rem] leading-[0.92] text-zinc-800 md:text-[3.75rem]';
const EYEBROW = 'text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/80 md:text-sm';

function getCountdown() {
  const diff = Math.max(0, EVENT_DATE.getTime() - Date.now());

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  return { days, hours, minutes, seconds };
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export default function LoginPage() {
  const router = useRouter();
  const pageBackground = useSectionBackground(SECTION_BACKGROUNDS, PAGE_BACKGROUND);
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState<ReturnType<typeof getCountdown> | null>(null);
  const [rsvpMessages, setRsvpMessages] = useState<GuestMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

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
    // Busca mensagens novas a cada 5s para o carrossel de post-its crescer quase em tempo real.
    const intervalId = window.setInterval(refreshMessages, 5000);
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
  const countdownItems = [
    { label: 'Dias', value: String(countdownValues.days) },
    { label: 'Horas', value: pad(countdownValues.hours) },
    { label: 'Minutos', value: pad(countdownValues.minutes) },
    { label: 'Segundos', value: pad(countdownValues.seconds) },
  ];

  return (
    // Sem overflow-hidden aqui: ele quebraria o "sticky" das seções que ficam presas na tela.
    <main
      className="relative text-zinc-800 [overflow-x:clip]"
      style={{ backgroundColor: pageBackground, transition: 'background-color 0.5s ease' }}
    >
      <ClickPetals />
      <FlowerConfetti targetId="cerimonia" />
      <SiteHeader ctaLabel="Confirmar presença" ctaHref="#rsvp" links={NAV_LINKS} />

      <Hero
        id="home"
        imageSrc={HERO_PHOTO}
        imagePosition={HERO_PHOTO_POSITION}
        introFocus={HERO_COUPLE}
        imageAlt="Igor e Bianca"
        headline="Igor & Bianca"
        scrollLabel="Role para explorar"
        galleryImages={HERO_GALLERY}
      />

      <section className={`${SECTION} flex min-h-[60svh] items-center justify-center text-center`}>
        <ScrollWords
          text="vocês estão convidados para celebrar a história de Igor e Bianca"
          className="mx-auto w-full max-w-[90vw] font-display text-[3rem] leading-[1.05] tracking-tight text-zinc-800 md:text-[3.75rem]"
        />
      </section>

      <StoryScroll id="nossa-historia" title="nossa história" chapters={STORY_CHAPTERS} />

      <section id="cerimonia" className="relative w-full scroll-mt-24">
        <div className="flex min-h-screen flex-col items-center justify-center px-4 py-24 text-center">
          <Reveal className="mb-16 flex w-full justify-center">
            <p className={`${HEADING} w-full max-w-5xl`}>então, venham celebrar conosco...</p>
          </Reveal>
          <Reveal delay={0.14} className="mb-16 flex w-full justify-center px-2">
            <h3 className="w-full max-w-[1120px] text-zinc-800">
              <span className="sr-only">18 de abril de 2027</span>
              <FittedText text="18 . 04 . 2027" fontSize={140} />
            </h3>
          </Reveal>
          <Reveal delay={0.28} className="w-full">
            <div className="mx-auto flex max-w-3xl items-start justify-center gap-2 md:gap-4">
              {countdownItems.map((item, index) => (
                <div key={item.label} className="flex items-start gap-2 md:gap-4">
                  {index > 0 ? (
                    <span className="mt-1 text-2xl font-light text-zinc-800 opacity-30 sm:text-3xl md:mt-2 md:text-5xl">:</span>
                  ) : null}
                  <div className="flex w-16 flex-col items-center sm:w-20 md:w-24">
                    <span className="mb-1 text-3xl font-light tabular-nums sm:text-4xl md:mb-2 md:text-6xl">{item.value}</span>
                    <span className="text-[0.55rem] uppercase tracking-[0.15em] opacity-80 sm:text-[0.65rem] sm:tracking-[0.2em] md:text-sm">
                      {item.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section id="local" className="relative z-20 w-full px-6 py-20 text-center md:px-10 md:py-28">
        <div className="mx-auto w-full max-w-[72rem]">
          {/* Foto do local em 21:9, igual à seção "venue" da Cordially: a moldura "abre" de cima para baixo
              (1,2s) enquanto a foto assenta de 103% para 100% (1,4s). A detecção de visibilidade fica na
              caixa de fora: o elemento recortado é visto como invisível e nunca dispararia. */}
          <motion.div
            className="relative mx-auto mb-16 aspect-[21/9] w-full overflow-hidden rounded-2xl md:mb-24"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
          >
            <motion.div
              className="h-full w-full overflow-hidden rounded-2xl"
              variants={{
                hidden: { clipPath: 'inset(0% 0% 100% 0%)' },
                visible: { clipPath: 'inset(0% 0% 0% 0%)' },
              }}
              transition={{ duration: 1.2, ease: REVEAL_EASE }}
            >
              <motion.div
                className="h-full w-full"
                variants={{ hidden: { scale: 1.03 }, visible: { scale: 1 } }}
                transition={{ duration: 1.4, ease: REVEAL_EASE }}
              >
                <VenueCarousel photos={VENUE_PHOTOS} intervalSeconds={5} />
              </motion.div>
            </motion.div>
          </motion.div>

          <div className="mx-auto w-full min-w-0 max-w-4xl">
            <Reveal delay={0.18}>
              <p className={`${HEADING} mb-4`}>{VENUE_NAME}</p>
            </Reveal>
            <Reveal delay={0.34}>
              <a
                href={GOOGLE_MAPS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`${EYEBROW} block transition-opacity hover:opacity-100`}
              >
                {VENUE_ADDRESS}
              </a>
            </Reveal>
          </div>
        </div>
      </section>

      <section id="rsvp" className={`${SECTION} scroll-mt-24`}>
        <div className="mx-auto flex max-w-6xl flex-col items-center text-center">
          <Reveal className="w-full">
            <h2 className={HEADING}>Confirme sua presença</h2>
          </Reveal>
          <Reveal delay={0.16} className="mt-5 w-full">
            <p className={`${EYEBROW} mx-auto max-w-2xl`}>Insira o código do seu convite para continuar</p>
          </Reveal>
          <Reveal delay={0.32} className="mt-8 w-full">
            <form className="mx-auto flex w-full max-w-md flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
              <label htmlFor="inviteCode" className="sr-only">
                Código do convite
              </label>
              <input
                id="inviteCode"
                type="text"
                value={inviteCode}
                onChange={(event) => {
                  setInviteCode(event.target.value);
                  setError('');
                }}
                className="min-w-0 flex-1 rounded-full border border-zinc-800/15 bg-[#fffaf1] px-6 py-4 text-sm text-zinc-800 placeholder:text-zinc-500 focus:border-champagne-600 focus:outline-none focus:ring-2 focus:ring-champagne-600/20"
                placeholder="Código do convite"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-full bg-champagne-600 px-10 py-4 text-xs font-medium uppercase tracking-[0.2em] text-[#fff9f1] transition-transform duration-500 ease-[cubic-bezier(0.22,0.72,0.36,1)] hover:scale-[1.02] disabled:cursor-wait disabled:opacity-70 md:text-sm"
              >
                {isSubmitting ? 'Entrando...' : 'Acessar convite'}
              </button>
            </form>
            {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
          </Reveal>
        </div>
      </section>

      <DetailsSection
        id="mensagens"
        title="mensagens de quem vai celebrar com a gente..."
        subtitle="Os recados carinhosos que os convidados deixaram ao confirmar presença."
        messages={rsvpMessages}
        isLoading={isLoadingMessages}
        emptyMessage="Ainda não há mensagens. Seja o primeiro!"
      />

      <section className={`${SECTION} flex justify-center text-center`}>
        <ScrollWords
          text="Criamos este convite para compartilhar com você os detalhes do nosso casamento. Estamos muito felizes e contamos com sua presença no nosso grande dia."
          className="w-full max-w-[90vw] font-display text-[2.6rem] leading-[1.05] tracking-tight text-zinc-800 md:text-[5rem]"
        />
      </section>

      <FaqSection id="perguntas" title="Perguntas e respostas" intro="Tudo o que você precisa saber antes do grande dia." items={FAQ_ITEMS} />

      <footer className="relative h-[100svh] w-full px-3 pb-4 pt-3 md:px-4 md:pb-6 md:pt-4 lg:px-5 lg:pt-5">
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[24px] px-6 text-center">
          <FooterCarousel photos={FOOTER_PHOTOS} intervalSeconds={8} />
          <p className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-white md:bottom-5 md:text-xs">
            © Desenvolvido por{' '}
            <a href="https://github.com/IgorFialho" target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
              Igor Fialho
            </a>
          </p>
        </div>
      </footer>
    </main>
  );
}
