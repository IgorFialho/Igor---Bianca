"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type VideoHTMLAttributes,
} from 'react';

// Corte de tempo dos vídeos do mural (escolher o trecho que vai ao ar). Nada é processado no celular: o editor só
// guarda início e fim, o vídeo é enviado inteiro e o Cloudinary entrega apenas o trecho (so_/eo_).

/** Trecho escolhido, em segundos. */
export type VideoTrim = { start: number; end: number };

/** Menor trecho aceito (segundos); o servidor usa o mesmo valor (lib/cloudinary.ts). */
export const MIN_TRIM_SECONDS = 1;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** 7.5 → "0:07,5" (décimos só quando há). */
export function formatClock(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  const whole = Math.floor(rest);
  const tenth = Math.round((rest - whole) * 10);
  const fixedWhole = tenth === 10 ? whole + 1 : whole;
  const fixedTenth = tenth === 10 ? 0 : tenth;
  return `${minutes}:${String(fixedWhole).padStart(2, '0')}${fixedTenth ? `,${fixedTenth}` : ''}`;
}

/** 12.5 → "12,5 s"; 75 → "1:15 min". */
export function formatLength(seconds: number) {
  if (seconds < 60) return `${(Math.round(seconds * 10) / 10).toLocaleString('pt-BR')} s`;
  return `${formatClock(seconds)} min`;
}

/** Trecho final para guardar: arredondado a 0,1 s; o vídeo inteiro (ou quase) vira null. */
export function normalizeTrim(trim: VideoTrim | null, duration: number): VideoTrim | null {
  if (!trim || !Number.isFinite(duration) || duration <= 0) return null;
  const start = Math.round(clamp(trim.start, 0, duration) * 10) / 10;
  const end = Math.round(clamp(trim.end, 0, duration) * 10) / 10;
  if (end - start < MIN_TRIM_SECONDS) return null;
  if (start <= 0.05 && end >= duration - 0.05) return null;
  return { start, end };
}

/**
 * Faz o vídeo tocar em repetição só dentro do trecho (o atributo loop repete o vídeo inteiro).
 * Usa requestAnimationFrame para voltar ao início do trecho sem passar do fim.
 */
export function useTrimLoop(videoRef: RefObject<HTMLVideoElement>, trim: VideoTrim | null, paused = false) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !trim) return;
    let frame = 0;
    const tick = () => {
      if (!paused && !video.paused && (video.currentTime >= trim.end - 0.03 || video.currentTime < trim.start - 0.25)) {
        video.currentTime = trim.start;
      }
      frame = window.requestAnimationFrame(tick);
    };
    // Trecho até o fim do vídeo: ao terminar, volta ao começo do trecho.
    const onEnded = () => {
      if (paused) return;
      video.currentTime = trim.start;
      void video.play().catch(() => undefined);
    };
    if (video.currentTime < trim.start || video.currentTime > trim.end) video.currentTime = trim.start;
    video.addEventListener('ended', onEnded);
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      video.removeEventListener('ended', onEnded);
    };
  }, [videoRef, trim, paused]);
}

/** <video> que toca (e repete) só o trecho escolhido. Sem trecho, repete o vídeo inteiro. */
export const TrimmedVideo = forwardRef<HTMLVideoElement, VideoHTMLAttributes<HTMLVideoElement> & { trim: VideoTrim | null }>(
  function TrimmedVideo({ trim, onLoadedMetadata, ...props }, forwardedRef) {
    const ref = useRef<HTMLVideoElement>(null);
    useImperativeHandle(forwardedRef, () => ref.current as HTMLVideoElement);
    useTrimLoop(ref, trim);
    return (
      <video
        ref={ref}
        loop={!trim}
        {...props}
        onLoadedMetadata={(event) => {
          if (trim) event.currentTarget.currentTime = trim.start;
          onLoadedMetadata?.(event);
        }}
      />
    );
  }
);

/** Miniaturas do vídeo para o fundo da barra (geradas no aparelho, pequenas). Falhou? A barra fica lisa. */
function useFilmstrip(src: string, duration: number, count: number) {
  const [frames, setFrames] = useState<string[]>([]);
  useEffect(() => {
    if (!src || !Number.isFinite(duration) || duration <= 0) return;
    let cancelled = false;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = src;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const seek = (time: number) =>
      new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('timeout')), 4000);
        video.addEventListener(
          'seeked',
          () => {
            window.clearTimeout(timer);
            resolve();
          },
          { once: true }
        );
        video.currentTime = time;
      });
    const run = async () => {
      await new Promise<void>((resolve, reject) => {
        if (video.readyState >= 2) return resolve();
        video.addEventListener('loadeddata', () => resolve(), { once: true });
        video.addEventListener('error', () => reject(new Error('video')), { once: true });
      });
      const height = 72;
      const width = Math.max(1, Math.round((height * (video.videoWidth || 16)) / (video.videoHeight || 9)));
      canvas.width = width;
      canvas.height = height;
      const result: string[] = [];
      for (let index = 0; index < count; index += 1) {
        if (cancelled || !context) return;
        await seek(((index + 0.5) / count) * duration);
        context.drawImage(video, 0, 0, width, height);
        result.push(canvas.toDataURL('image/jpeg', 0.6));
        if (!cancelled) setFrames([...result]);
      }
    };
    run().catch(() => undefined);
    return () => {
      cancelled = true;
      video.removeAttribute('src');
      video.load();
    };
  }, [src, duration, count]);
  return frames;
}

type Drag = { mode: 'start' | 'end' | 'move'; pointerId: number; grabOffset: number };

type TrimBarProps = {
  /** Endereço local do vídeo (para as miniaturas). */
  src: string;
  duration: number;
  trim: VideoTrim;
  /** Posição atual da prévia (linha branca). */
  currentTime: number;
  /** Durante o arraste: o trecho muda e a prévia mostra o quadro da ponta que está sendo puxada. */
  onChange: (trim: VideoTrim, edge: 'start' | 'end' | 'move') => void;
  /** Soltou: a prévia volta a tocar do início do trecho. */
  onCommit: () => void;
};

/** Barra de trecho (estilo Instagram): miniaturas, alças de início/fim e o trecho inteiro arrastável. */
export function VideoTrimBar({ src, duration, trim, currentTime, onChange, onCommit }: TrimBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [activeEdge, setActiveEdge] = useState<Drag['mode'] | null>(null);
  const frames = useFilmstrip(src, duration, 8);
  const length = trim.end - trim.start;
  const pct = (seconds: number) => `${(clamp(seconds / duration, 0, 1) * 100).toFixed(3)}%`;

  const timeAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return 0;
    return clamp(((clientX - rect.left) / rect.width) * duration, 0, duration);
  };

  const begin = (mode: Drag['mode']) => (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { mode, pointerId: event.pointerId, grabOffset: timeAt(event.clientX) - trim.start };
    setActiveEdge(mode);
    onChange(trim, mode);
  };

  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const time = timeAt(event.clientX);
    if (drag.mode === 'start') onChange({ start: clamp(time, 0, trim.end - MIN_TRIM_SECONDS), end: trim.end }, 'start');
    else if (drag.mode === 'end') onChange({ start: trim.start, end: clamp(time, trim.start + MIN_TRIM_SECONDS, duration) }, 'end');
    else {
      const start = clamp(time - drag.grabOffset, 0, duration - length);
      onChange({ start, end: start + length }, 'move');
    }
  };

  const end = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setActiveEdge(null);
    onCommit();
  };

  // Teclado nas alças: setas mudam 0,1 s (com Shift, 1 s).
  const onKey = (edge: 'start' | 'end') => (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 1 : 0.1);
    if (edge === 'start') onChange({ start: clamp(trim.start + step, 0, trim.end - MIN_TRIM_SECONDS), end: trim.end }, 'start');
    else onChange({ start: trim.start, end: clamp(trim.end + step, trim.start + MIN_TRIM_SECONDS, duration) }, 'end');
    onCommit();
  };

  const handle = (edge: 'start' | 'end') => (
    <div
      role="slider"
      tabIndex={0}
      aria-label={edge === 'start' ? 'Início do trecho' : 'Fim do trecho'}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration * 10) / 10}
      aria-valuenow={Math.round((edge === 'start' ? trim.start : trim.end) * 10) / 10}
      aria-valuetext={formatClock(edge === 'start' ? trim.start : trim.end)}
      onPointerDown={begin(edge)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKey(edge)}
      className={`absolute inset-y-0 z-20 flex w-4 cursor-ew-resize touch-none items-center justify-center bg-[#e7c88a] focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
        edge === 'start' ? '-translate-x-full rounded-l-lg' : 'rounded-r-lg'
      } ${activeEdge === edge ? 'brightness-110' : ''}`}
      style={{ left: pct(edge === 'start' ? trim.start : trim.end) }}
    >
      <span className="h-5 w-[3px] rounded-full bg-zinc-900/60" aria-hidden="true" />
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-md select-none">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-white/85">Trecho do vídeo</span>
        <span className="tabular-nums text-white/70">
          {formatClock(trim.start)} – {formatClock(trim.end)} · <span className="font-medium text-white">{formatLength(length)}</span>
        </span>
      </div>
      {/* As alças ficam por fora do trecho: o trilho tem margem para elas não saírem da tela. */}
      <div className="px-4">
        <div ref={trackRef} className="relative h-12">
          {/* Miniaturas (ou fundo liso enquanto/se não carregarem). */}
          <div className="absolute inset-0 flex overflow-hidden rounded-md bg-white/10">
            {frames.map((frame, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={index} src={frame} alt="" className="h-full min-w-0 flex-1 object-cover" draggable={false} />
            ))}
          </div>
          {/* Fora do trecho: escurecido. */}
          <div className="pointer-events-none absolute inset-y-0 left-0 rounded-l-md bg-black/65" style={{ width: pct(trim.start) }} />
          <div className="pointer-events-none absolute inset-y-0 right-0 rounded-r-md bg-black/65" style={{ left: pct(trim.end) }} />
          {/* O trecho: arrastar o meio move a janela inteira. */}
          <div
            aria-hidden="true"
            onPointerDown={begin('move')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            className={`absolute inset-y-0 z-10 touch-none border-y-[3px] border-[#e7c88a] ${activeEdge === 'move' ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{ left: pct(trim.start), width: pct(length) }}
          />
          {/* Onde a prévia está tocando. */}
          {currentTime >= trim.start && currentTime <= trim.end ? (
            <div
              className="pointer-events-none absolute -inset-y-1 z-10 w-[3px] -translate-x-1/2 rounded-full bg-white shadow-[0_0_4px_rgba(0,0,0,0.6)]"
              style={{ left: pct(currentTime) }}
              aria-hidden="true"
            />
          ) : null}
          {handle('start')}
          {handle('end')}
        </div>
      </div>
      <p className="mt-2 text-center text-[0.7rem] text-white/55">
        Puxe as pontas para escolher o início e o fim; arraste o meio para mover o trecho.
      </p>
    </div>
  );
}
