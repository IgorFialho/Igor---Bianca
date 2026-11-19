"use client";

import { Poppins } from 'next/font/google';
import { type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { playSealCrack } from '@/lib/seal-crack-sound';

// Envelope do convite, fiel ao design do Canva: a arte dos SVGs do Canva (envelope e selo), recortada no tamanho
// de cada peça e salva em WebP no dobro/triplo do tamanho de tela (envelope sem perda, 105 KB; selo, 37 KB; os SVGs
// tinham 2,4 MB com PNGs de até 4406 px embutidos). A aba é a mesma imagem do envelope recortada no contorno dela
// (medido na arte), para dobrar em 3D sem trocar de imagem. Sequência: selo intacto → selo racha no contorno da aba →
// a aba abre levando a metade de cima do selo → o cartão sobe → o cartão cresce até o lugar do formulário →
// onOpened. O papel que sai do envelope É o cartão do formulário (mesmas classes e o mesmo conteúdo, em escala),
// então a troca pelo formulário de verdade não muda nada na tela.

const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500'] });

const ENVELOPE_SRC = '/imagens/convite/envelope.webp';
const SEAL_SRC = '/imagens/convite/selo.webp';

/** Proporção do recorte do envelope (802 × 544,97 no canvas do Canva), incluindo a sombra da arte. */
const ENVELOPE_RATIO = 802 / 544.97;

// Contorno da aba em frações do recorte (objectBoundingBox), medido sobre a arte ampliada.
const FLAP_PATH =
  'M0.0167 0 L0.9505 0 L0.9505 0.0883 C0.948 0.133 0.932 0.16 0.91 0.1766 L0.525 0.5516 ' +
  'C0.508 0.568 0.497 0.5735 0.4867 0.5735 C0.476 0.5735 0.465 0.568 0.45 0.5556 L0.0583 0.1913 ' +
  'C0.04 0.17 0.02 0.135 0.0167 0.0834 Z';
/** Dobradiça da aba (borda de cima do envelope) e eixo vertical dela, em % do recorte. */
const HINGE_Y = '0.37%';
const FLAP_AXIS_X = '48.4%';

/** Posição do selo no recorte do envelope (mesmo canvas do Canva). */
const SEAL_BOX = { left: '39.01%', top: '41.24%', width: '20.1%', height: '29.3%' };

// Rachadura do selo (em % da caixa do selo): segue o contorno da aba, com pequenos dentes de cera quebrada.
const CRACK: Array<[number, number]> = [
  [0, 30], [5, 32.5], [9, 32], [13, 36], [18, 37.5], [22, 41], [27, 42.5], [31, 46.5], [36, 47.5], [40, 51.5],
  [44, 53], [48, 55.5], [52, 53.5], [56, 52], [60, 48], [65, 46.5], [69, 42.5], [74, 41], [78, 37], [83, 35],
  [88, 31], [93, 29.5], [100, 25.5],
];
const TIP_INDEX = 11;
const toPolygon = (points: Array<[number, number]>) => points.map(([x, y]) => `${x}% ${y}%`).join(', ');
const UPPER_PIECE = `polygon(0% 0%, 100% 0%, ${toPolygon([...CRACK].reverse())})`;
const LOWER_PIECE = `polygon(${toPolygon(CRACK)}, 100% 100%, 0% 100%)`;
const toLine = (points: Array<[number, number]>) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
const CRACK_LEFT = toLine(CRACK.slice(0, TIP_INDEX + 1).reverse());
const CRACK_RIGHT = toLine(CRACK.slice(TIP_INDEX));

// Lascas de cera que soltam na quebra (posição na caixa do selo; deslocamento em % do tamanho da lasca).
const CRUMBS = [
  { x: 10, y: 34, size: 2.2, dx: -230, dy: 420, r: -160, delay: 0 },
  { x: 20, y: 39, size: 1.3, dx: -170, dy: 560, r: 210, delay: 0.05 },
  { x: 31, y: 46, size: 1.9, dx: -90, dy: 470, r: -90, delay: 0.02 },
  { x: 42, y: 52, size: 1.1, dx: -40, dy: 680, r: 180, delay: 0.08 },
  { x: 50, y: 55, size: 1.6, dx: 20, dy: 520, r: -130, delay: 0.04 },
  { x: 60, y: 49, size: 1.2, dx: 90, dy: 640, r: 150, delay: 0.07 },
  { x: 70, y: 42, size: 2.0, dx: 150, dy: 450, r: 140, delay: 0.03 },
  { x: 80, y: 36, size: 1.2, dx: 210, dy: 600, r: -200, delay: 0.06 },
  { x: 90, y: 31, size: 1.8, dx: 250, dy: 430, r: 120, delay: 0.01 },
];
const CRUMB_SHAPES = [
  'polygon(18% 0%, 82% 12%, 100% 58%, 64% 100%, 8% 82%, 0% 30%)',
  'polygon(30% 0%, 100% 22%, 86% 88%, 22% 100%, 0% 44%)',
  'polygon(0% 18%, 62% 0%, 100% 52%, 70% 100%, 14% 86%)',
];

type Phase = 'idle' | 'cracking' | 'opening' | 'rising' | 'done';

/** Cartão do formulário (usado também na página): o papel do envelope usa exatamente estas classes. */
export const INVITE_CARD_CLASS =
  'relative overflow-hidden rounded-[2rem] border border-zinc-800/10 bg-[#fffaf1] shadow-[0_24px_60px_rgba(47,36,27,0.12)]';
export const INVITE_CARD_BODY_CLASS = 'relative z-10 p-6 sm:p-10';
/** Largura do cartão do formulário: w-full max-w-xl sm:max-w-2xl. */
const finalCardWidth = (available: number) => {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const max = window.matchMedia('(min-width: 640px)').matches ? 42 * rem : 36 * rem;
  return Math.min(available, max);
};

// Cartão dentro do envelope: 84% × 86% do envelope.
const CARD_W = 0.84;
const CARD_H = 0.86;

// Saída do cartão num movimento só (sem paradas): sobe durante todo o tempo e, já fora do envelope,
// cresce e se alinha ao lugar do formulário; tudo termina junto.
const OPEN_DURATION = 1.25; // aba
const CARD_START = 1.1; // o cartão começa a subir no fim da abertura da aba
const RISE_DURATION = 2.3;
const GROW_DELAY = 0.75;
const GROW_DURATION = RISE_DURATION - GROW_DELAY;
const RISE_EASE: [number, number, number, number] = [0.5, 0, 0.18, 1];
const GROW_EASE: [number, number, number, number] = [0.42, 0, 0.2, 1];

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
const EASE_IN_OUT: [number, number, number, number] = [0.6, 0, 0.25, 1];

type SealedEnvelopeProps = {
  /** Chamado quando o cartão terminou de sair do envelope. */
  onOpened: () => void;
  /** Conteúdo do cartão do formulário (o mesmo mostrado depois de aberto). */
  children: ReactNode;
};

type Geometry = { envW: number; envH: number; finalW: number };
type Morph = { x: number; y: number; scale: number; height: number };

export function SealedEnvelope({ onOpened, children }: SealedEnvelopeProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [ready, setReady] = useState(false);
  const reduceMotion = useReducedMotion();
  const timers = useRef<number[]>([]);
  const uid = useId().replace(/:/g, '');
  const flapClip = `url(#flap-${uid})`;
  const pocketClip = `url(#pocket-${uid})`;
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cardBodyRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [morph, setMorph] = useState<Morph | null>(null);

  // Mede o envelope e a largura que o cartão do formulário terá (para desenhar o papel na mesma escala).
  useLayoutEffect(() => {
    const box = boxRef.current;
    const anchor = rootRef.current?.parentElement;
    if (!box || !anchor) return;
    const measure = () => setGeometry({ envW: box.offsetWidth, envH: box.offsetHeight, finalW: finalCardWidth(anchor.clientWidth) });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(anchor);
    return () => observer.disconnect();
  }, []);

  // A cópia do formulário dentro do envelope é só imagem: sem foco, clique ou leitor de tela (aplicado uma vez,
  // quando a cópia aparece).
  const setCopyRef = useCallback((element: HTMLDivElement | null) => {
    element?.setAttribute('inert', '');
  }, []);

  // Mede onde o cartão está (parado, dentro do envelope) e para onde vai (lugar exato do formulário).
  const startRise = () => {
    const card = cardRef.current;
    const body = cardBodyRef.current;
    const anchor = rootRef.current?.parentElement;
    if (!card || !body || !anchor || !geometry) {
      setPhase('done');
      onOpened();
      return;
    }
    const rect = card.getBoundingClientRect();
    const target = anchor.getBoundingClientRect();
    const finalW = finalCardWidth(anchor.clientWidth);
    const targetLeft = target.left + (target.width - finalW) / 2;
    setMorph({
      x: targetLeft - rect.left,
      y: target.top - rect.top,
      scale: finalW / rect.width,
      height: body.offsetHeight + 2, // + bordas do cartão
    });
    setPhase('rising');
  };

  // Mostra o envelope só com envelope e selo já decodificados (sem "piscar" peça por peça).
  useEffect(() => {
    let cancelled = false;
    const decode = (src: string) => {
      const image = new Image();
      image.src = src;
      return image.decode().catch(() => undefined);
    };
    const fallback = window.setTimeout(() => !cancelled && setReady(true), 4000);
    Promise.all([decode(ENVELOPE_SRC), decode(SEAL_SRC)]).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }, []);

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const open = () => {
    if (phase !== 'idle') return;
    if (reduceMotion) {
      setPhase('done');
      later(onOpened, 250);
      return;
    }
    // Estalo da cera (gerado no navegador, sem arquivo) e a música abaixa por um momento.
    playSealCrack();
    setPhase('cracking');
    later(() => setPhase('opening'), 820);
    later(startRise, 820 + CARD_START * 1000);
  };

  const sealBroken = phase !== 'idle' && phase !== 'cracking';
  const flapOpen = phase === 'opening' || phase === 'rising' || phase === 'done';
  const cardOut = phase === 'rising' || phase === 'done';
  // Enquanto o cartão sai, o envelope some devagar (começa quando o cartão já está quase todo fora).
  const fade = {
    opacity: cardOut ? 0 : 1,
    transition: `opacity ${GROW_DURATION * 0.55}s ease-in-out ${GROW_DELAY + 0.05}s`,
  };
  // Escala do papel dentro do envelope em relação ao cartão do formulário.
  const paperScale = geometry ? (CARD_W * geometry.envW) / geometry.finalW : 1;
  const paperHeight = geometry ? (CARD_H * geometry.envH) / paperScale : 0;

  return (
    <div
      ref={rootRef}
      className="relative mx-auto"
      style={{ width: 'var(--env-w)', aspectRatio: `${ENVELOPE_RATIO} / 1.6` }}
    >
      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <defs>
          <clipPath id={`flap-${uid}`} clipPathUnits="objectBoundingBox">
            <path d={FLAP_PATH} />
          </clipPath>
          {/* Corpo do envelope = recorte inteiro menos a aba. */}
          <clipPath id={`pocket-${uid}`} clipPathUnits="objectBoundingBox">
            <path d={`M0 0 H1 V1 H0 Z ${FLAP_PATH}`} clipRule="evenodd" />
          </clipPath>
        </defs>
      </svg>

      {/* O envelope fica parado na parte de baixo do palco (o espaço de cima é da aba aberta): nada desce
          nem volta, o cartão só sobe. */}
      <motion.div
        className="absolute inset-x-0 bottom-0"
        style={{ aspectRatio: `${ENVELOPE_RATIO}` }}
        initial={{ opacity: 0, y: '-12%' }}
        animate={{ opacity: ready ? 1 : 0, y: '-12%' }}
        transition={{ duration: 0.6 }}
      >
        <motion.div
          role="button"
          tabIndex={phase === 'idle' ? 0 : -1}
          aria-label="Abrir o convite"
          aria-disabled={phase !== 'idle'}
          onClick={open}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              open();
            }
          }}
          ref={boxRef}
          whileHover={phase === 'idle' ? { y: -4 } : undefined}
          transition={{ type: 'spring', stiffness: 140, damping: 20 }}
          className={`relative h-full w-full select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${
            phase === 'idle' ? 'cursor-pointer' : ''
          }`}
          style={{ containerType: 'inline-size', perspective: 'calc(var(--env-w) * 2.6)' }}
        >
          {/* 1. Parte de dentro do envelope (aparece quando a aba levanta). */}
          <div
            className="absolute z-0 bg-[linear-gradient(180deg,#e9e2da_0%,#f1ece6_55%,#f4f0eb_100%)] shadow-[inset_0_14px_22px_rgba(80,60,40,0.12)]"
            style={{ left: '1.25%', top: '0.37%', width: '94.3%', height: '94.1%', ...fade }}
          />

          {/* 2. Aba de cima: mesma arte do envelope recortada no contorno da aba, com a metade de cima do selo. */}
          <motion.div
            className="absolute inset-0"
            style={{ transformStyle: 'preserve-3d', transformOrigin: `50% ${HINGE_Y}`, zIndex: cardOut ? 10 : 50 }}
            initial={false}
            animate={{ rotateX: flapOpen ? -180 : 0 }}
            transition={{ duration: OPEN_DURATION, ease: EASE_IN_OUT }}
          >
            <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', ...fade }}>
              <img
                src={ENVELOPE_SRC}
                alt=""
                draggable={false}
                className="absolute inset-0 h-full w-full"
                style={{ clipPath: flapClip, WebkitClipPath: flapClip }}
              />
              {/* Sombra que a aba ganha ao virar para cima. */}
              <motion.div
                className="absolute inset-0 bg-[#4a3a2a]"
                style={{ clipPath: flapClip, WebkitClipPath: flapClip }}
                initial={false}
                animate={{ opacity: flapOpen ? 0.22 : 0 }}
                transition={{ duration: 0.6, ease: 'easeIn' }}
              />
              <img
                src={SEAL_SRC}
                alt=""
                draggable={false}
                className="absolute"
                style={{ ...SEAL_BOX, clipPath: UPPER_PIECE, WebkitClipPath: UPPER_PIECE, transform: 'translateZ(1px)' }}
              />
            </div>
            {/* Verso da aba (papel por dentro). */}
            <div
              className="absolute inset-0"
              style={{
                transform: 'rotateY(180deg)',
                transformOrigin: `${FLAP_AXIS_X} 50%`,
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                ...fade,
              }}
            >
              <div
                className="absolute inset-0 bg-[linear-gradient(0deg,#ebe4dc_0%,#f3eee8_60%,#f6f2ed_100%)]"
                style={{ clipPath: flapClip, WebkitClipPath: flapClip }}
              />
              <motion.div
                className="absolute inset-0 bg-[#4a3a2a]"
                style={{ clipPath: flapClip, WebkitClipPath: flapClip }}
                initial={false}
                animate={{ opacity: flapOpen ? 0 : 0.25 }}
                transition={{ duration: 1.1, ease: 'easeOut' }}
              />
            </div>
          </motion.div>

          {/* 3. Cartão do formulário: começa guardado, sobe pela abertura e depois cresce até o lugar do formulário. */}
          <motion.div
            ref={cardRef}
            className="absolute z-20"
            style={{ left: '6.4%', top: '3.4%', width: `${CARD_W * 100}%`, height: `${CARD_H * 100}%`, transformOrigin: '0 0' }}
            initial={false}
            animate={morph ? { x: morph.x, y: morph.y, scale: morph.scale } : { x: 0, y: 0, scale: 1 }}
            transition={{
              y: { duration: RISE_DURATION, ease: RISE_EASE },
              x: { duration: GROW_DURATION, delay: GROW_DELAY, ease: GROW_EASE },
              scale: { duration: GROW_DURATION, delay: GROW_DELAY, ease: GROW_EASE },
            }}
            onAnimationComplete={() => {
              if (phase === 'rising') {
                setPhase('done');
                onOpened();
              }
            }}
          >
            {geometry ? (
              <motion.div
                ref={setCopyRef}
                aria-hidden="true"
                className={`absolute left-0 top-0 ${INVITE_CARD_CLASS}`}
                style={{ width: geometry.finalW, transformOrigin: '0 0', scale: paperScale }}
                initial={false}
                animate={{ height: morph ? morph.height : paperHeight }}
                transition={{ duration: GROW_DURATION, delay: GROW_DELAY, ease: GROW_EASE }}
              >
                <div ref={cardBodyRef} className={INVITE_CARD_BODY_CLASS}>
                  {children}
                </div>
              </motion.div>
            ) : null}
          </motion.div>

          {/* 4. Corpo do envelope (tudo menos a aba): o cartão passa por trás dele. */}
          <img
            src={ENVELOPE_SRC}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 z-30 h-full w-full"
            style={{ clipPath: pocketClip, WebkitClipPath: pocketClip, ...fade }}
          />

          {/* 5. Metade de baixo do selo, que fica no envelope e assenta depois da quebra. */}
          <motion.img
            src={SEAL_SRC}
            alt=""
            draggable={false}
            className="pointer-events-none absolute z-40"
            style={{ ...SEAL_BOX, clipPath: LOWER_PIECE, WebkitClipPath: LOWER_PIECE, transformOrigin: '50% 80%', ...fade }}
            initial={false}
            animate={sealBroken ? { y: '2%', rotate: 2.5 } : { y: '0%', rotate: 0 }}
            transition={{ duration: 0.7, ease: EASE_OUT }}
          />

          {/* 6. Envelope inteiro e selo intacto enquanto fechado (sem emendas entre as camadas). */}
          {!sealBroken ? (
            <>
              <img
                src={ENVELOPE_SRC}
                alt=""
                draggable={false}
                className="pointer-events-none absolute inset-0 z-[45] h-full w-full"
              />
              <motion.div
                className="pointer-events-none absolute z-[60]"
                style={SEAL_BOX}
                initial={false}
                animate={
                  phase === 'cracking'
                    ? { scale: [1, 0.955, 1.012, 1, 1, 1, 1], x: [0, 0, 0, 0, -1.6, 1.4, 0] }
                    : { scale: 1, x: 0 }
                }
                transition={{ duration: 0.8, times: [0, 0.14, 0.32, 0.45, 0.62, 0.78, 1], ease: 'easeOut' }}
              >
                <img src={SEAL_SRC} alt="" draggable={false} className="h-full w-full" />
                {/* Rachadura: nasce na ponta da aba e corre para os dois lados. */}
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
                  {[CRACK_LEFT, CRACK_RIGHT].map((d) => (
                    <g key={d}>
                      <motion.path
                        d={d}
                        fill="none"
                        stroke="rgba(255,232,205,0.4)"
                        strokeWidth={1.6}
                        vectorEffect="non-scaling-stroke"
                        transform="translate(0 0.9)"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={phase === 'cracking' ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                        transition={{ duration: 0.38, delay: 0.12, ease: 'easeOut' }}
                      />
                      <motion.path
                        d={d}
                        fill="none"
                        stroke="rgba(58,30,12,0.85)"
                        strokeWidth={1.4}
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={phase === 'cracking' ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                        transition={{ duration: 0.38, delay: 0.12, ease: 'easeOut' }}
                      />
                    </g>
                  ))}
                </svg>
              </motion.div>
            </>
          ) : null}

          {/* 7. Lascas de cera que caem na quebra. */}
          {phase !== 'idle' ? (
            <div className="pointer-events-none absolute z-[65]" style={SEAL_BOX}>
              {CRUMBS.map((crumb, index) => (
                <motion.span
                  key={index}
                  className="absolute block bg-[radial-gradient(circle_at_35%_30%,#e8bd8e_0%,#a9693a_45%,#6a3a1a_100%)] drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]"
                  style={{
                    left: `${crumb.x}%`,
                    top: `${crumb.y}%`,
                    width: `${crumb.size * 0.75}cqw`,
                    height: `${crumb.size * 0.75}cqw`,
                    clipPath: CRUMB_SHAPES[index % CRUMB_SHAPES.length],
                  }}
                  initial={{ opacity: 0, x: '-50%', y: '-50%', rotate: 0 }}
                  animate={{
                    opacity: [0, 1, 1, 0],
                    x: ['-50%', `${crumb.dx * 0.45 - 50}%`, `${crumb.dx - 50}%`],
                    y: ['-50%', `${-crumb.dy * 0.15 - 50}%`, `${crumb.dy * 1.9 - 50}%`],
                    rotate: [0, crumb.r * 0.4, crumb.r],
                  }}
                  transition={{ duration: 1.3, delay: 0.5 + crumb.delay, ease: [0.45, 0, 0.85, 0.5], times: [0, 0.22, 1] }}
                />
              ))}
            </div>
          ) : null}
        </motion.div>

        <motion.p
          className={`${poppins.className} pointer-events-none absolute inset-x-0 top-full mt-6 text-center text-sm uppercase tracking-[0.04em] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)] sm:mt-8 sm:text-lg`}
          initial={false}
          animate={{ opacity: phase === 'idle' ? [0.55, 1, 0.55] : 0 }}
          transition={phase === 'idle' ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
        >
          Toque para abrir o convite
        </motion.p>
      </motion.div>
    </div>
  );
}
