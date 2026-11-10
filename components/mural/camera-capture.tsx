"use client";

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Portal } from '@/components/home/portal';
import { MEDIA_RECORDING_EVENT } from '@/components/site-music-player';

// Câmera dentro do mural, como nos Stories do Instagram: imagem ao vivo, Foto (um toque) ou Vídeo (toque para
// começar/parar, até 60 s), virar câmera e abrir a galeria. O microfone só é pedido ao gravar vídeo.

const MAX_RECORD_SECONDS = 60;

type Mode = 'photo' | 'video';
type Facing = 'environment' | 'user';

type CameraCaptureProps = {
  onCapture: (file: File) => void;
  onGallery: () => void;
  onClose: () => void;
};

/** Formato de gravação que o navegador suporta (Safari grava MP4; Chrome/Android, WebM). */
function pickRecorderType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export function isCameraSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

// Um pedido de câmera por vez: pedidos simultâneos ao mesmo aparelho falham ("câmera em uso") ou derrubam um
// ao outro; quem pede de novo enquanto o primeiro está em andamento recebe o mesmo resultado.
let pendingCamera: { facing: Facing; promise: Promise<MediaStream> } | null = null;

function requestCamera(facing: Facing) {
  if (pendingCamera?.facing === facing) return pendingCamera.promise;
  const promise = navigator.mediaDevices
    .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
    .finally(() => {
      if (pendingCamera?.promise === promise) pendingCamera = null;
    });
  pendingCamera = { facing, promise };
  return promise;
}

export function CameraCapture({ onCapture, onGallery, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<number | null>(null);
  const [mode, setMode] = useState<Mode>('photo');
  const [facing, setFacing] = useState<Facing>('environment');
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [flash, setFlash] = useState(0);
  // Fechar durante a gravação descarta o vídeo (não abre a prévia).
  const discardRef = useRef(false);
  const closeCamera = () => {
    discardRef.current = true;
    onClose();
  };

  const stopTracks = (stream: MediaStream | null) => stream?.getTracks().forEach((track) => track.stop());
  const mountedRef = useRef(false);

  // Liga a câmera ao vídeo da tela. Chamado quando a câmera responde e quando o vídeo aparece na tela
  // (a câmera pode responder antes do vídeo existir, já que ele é desenhado num portal).
  const attachStream = (video: HTMLVideoElement | null) => {
    const stream = streamRef.current;
    if (!video || !stream || video.srcObject === stream) return;
    video.srcObject = stream;
    video.play().catch(() => undefined);
  };
  const setVideoElement = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    attachStream(video);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const facingRef = useRef<Facing | null>(null);

  // Liga (ou troca) a câmera.
  useEffect(() => {
    let cancelled = false;
    setIsReady(false);
    setError('');
    // Trocar de câmera: desliga a atual antes de pedir a outra (muitos celulares não abrem as duas juntas).
    if (streamRef.current && facingRef.current !== facing) {
      stopTracks(streamRef.current);
      streamRef.current = null;
    }
    requestCamera(facing)
      .then((stream) => {
        if (cancelled) {
          // Só desliga se o componente saiu de verdade; se ele só remontou, o pedido seguinte usa este stream.
          if (!mountedRef.current) stopTracks(stream);
          return;
        }
        if (streamRef.current && streamRef.current !== stream) stopTracks(streamRef.current);
        streamRef.current = stream;
        facingRef.current = facing;
        attachStream(videoRef.current);
        setIsReady(true);
      })
      .catch((cameraError: DOMException) => {
        if (cancelled) return;
        setError(
          cameraError?.name === 'NotAllowedError'
            ? 'Permita o acesso à câmera nas configurações do navegador para tirar fotos aqui.'
            : 'Não foi possível abrir a câmera neste aparelho.'
        );
      });
    return () => {
      cancelled = true;
    };
  }, [facing]);

  // Desliga câmera e microfone ao sair.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (tickRef.current) window.clearInterval(tickRef.current);
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      // Adia um instante: se o componente só remontou (modo de desenvolvimento), ele volta a usar a câmera.
      const stream = streamRef.current;
      const audio = audioRef.current;
      window.setTimeout(() => {
        if (!mountedRef.current) {
          stopTracks(stream);
          stopTracks(audio);
        }
      }, 0);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        discardRef.current = true;
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isRecording, onClose]);

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    // Selfie sai como aparece na tela (espelhada), igual ao Instagram.
    if (facing === 'user') {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setFlash((count) => count + 1);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.9
    );
  };

  const stopRecording = useCallback(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const startRecording = async () => {
    const stream = streamRef.current;
    const type = pickRecorderType();
    if (!stream || type === null) {
      setError('Este navegador não grava vídeo aqui. Use "Galeria" para enviar um vídeo já gravado.');
      return;
    }
    // Microfone só agora; sem permissão, grava sem som.
    let audioTracks: MediaStreamTrack[] = [];
    try {
      stopTracks(audioRef.current);
      audioRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioTracks = audioRef.current.getAudioTracks();
    } catch {
      audioTracks = [];
    }
    const recordStream = new MediaStream([...stream.getVideoTracks(), ...audioTracks]);
    const recorder = new MediaRecorder(recordStream, type ? { mimeType: type, videoBitsPerSecond: 5_000_000 } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      setIsRecording(false);
      window.dispatchEvent(new CustomEvent(MEDIA_RECORDING_EVENT, { detail: false }));
      stopTracks(audioRef.current);
      audioRef.current = null;
      const mime = recorder.mimeType || type || 'video/webm';
      const blob = new Blob(chunksRef.current, { type: mime.split(';')[0] });
      if (blob.size === 0 || discardRef.current) return;
      const extension = mime.includes('mp4') ? 'mp4' : 'webm';
      onCapture(new File([blob], `video-${Date.now()}.${extension}`, { type: mime.split(';')[0] }));
    };
    recorderRef.current = recorder;
    // Avisa o player do site para pausar a música durante a gravação (e voltar depois).
    window.dispatchEvent(new CustomEvent(MEDIA_RECORDING_EVENT, { detail: true }));
    recorder.start(250);
    setIsRecording(true);
    setElapsed(0);
    const startedAt = Date.now();
    tickRef.current = window.setInterval(() => {
      const seconds = (Date.now() - startedAt) / 1000;
      setElapsed(seconds);
      if (seconds >= MAX_RECORD_SECONDS) stopRecording();
    }, 200);
  };

  const handleShutter = () => {
    if (!isReady) return;
    if (mode === 'photo') takePhoto();
    else if (isRecording) stopRecording();
    else startRecording();
  };

  const progress = Math.min(1, elapsed / MAX_RECORD_SECONDS);
  const circumference = 2 * Math.PI * 36;
  const timeLabel = `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`;

  return (
    <Portal>
      <div className="fixed inset-0 z-[220] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Câmera do mural">
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
          <button type="button" onClick={closeCamera} aria-label="Fechar a câmera" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/50 text-3xl leading-none backdrop-blur-sm transition-colors hover:bg-black/70 disabled:opacity-40">
            ×
          </button>
          {isRecording ? (
            <span className="flex items-center gap-2 rounded-full bg-rose-600/90 px-3 py-1 text-sm font-medium tabular-nums">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden="true" />
              {timeLabel}
            </span>
          ) : (
            <span />
          )}
          <span className="h-10 w-10" />
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden sm:mx-auto sm:my-4 sm:aspect-[9/16] sm:h-[calc(100svh-13rem)] sm:w-auto sm:flex-none sm:rounded-3xl">
          <video
            ref={setVideoElement}
            playsInline
            muted
            autoPlay
            className={`absolute inset-0 h-full w-full object-cover ${facing === 'user' ? '-scale-x-100' : ''}`}
          />
          {!isReady && !error ? <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Abrindo a câmera…</p> : null}
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
              <p className="text-sm text-white/85">{error}</p>
              <button type="button" onClick={onGallery} className="rounded-full bg-white px-6 py-3 text-xs font-medium uppercase tracking-[0.16em] text-zinc-900">
                Escolher da galeria
              </button>
            </div>
          ) : null}

          {/* Clarão ao tirar a foto. */}
          <AnimatePresence>
            {flash > 0 ? (
              <motion.div
                key={flash}
                initial={{ opacity: 0.9 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                onAnimationComplete={() => setFlash(0)}
                className="pointer-events-none absolute inset-0 bg-white"
              />
            ) : null}
          </AnimatePresence>

        </div>

        <div className="shrink-0 px-6 pb-6 pt-4" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
          {/* Modo: Foto / Vídeo */}
          <div className="mb-5 flex justify-center gap-6 text-xs font-semibold uppercase tracking-[0.2em]" role="radiogroup" aria-label="Modo da câmera">
            {(['photo', 'video'] as Mode[]).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={mode === option}
                disabled={isRecording}
                onClick={() => setMode(option)}
                className={`pb-1 transition-colors ${mode === option ? 'border-b-2 border-white text-white' : 'text-white/55 hover:text-white/80'}`}
              >
                {option === 'photo' ? 'Foto' : 'Vídeo'}
              </button>
            ))}
          </div>

          <div className="mx-auto flex max-w-sm items-center justify-between">
            <button type="button" onClick={onGallery} disabled={isRecording} aria-label="Escolher da galeria" className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-white/80 disabled:opacity-40">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
                <circle cx="9" cy="10" r="1.8" />
                <path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" strokeLinejoin="round" />
              </svg>
            </button>

            <button
              type="button"
              onClick={handleShutter}
              disabled={!isReady}
              aria-label={mode === 'photo' ? 'Tirar foto' : isRecording ? 'Parar gravação' : 'Começar a gravar'}
              className="relative flex h-20 w-20 items-center justify-center disabled:opacity-40"
            >
              <svg viewBox="0 0 80 80" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
                <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="4" />
                {isRecording ? (
                  <circle cx="40" cy="40" r="36" fill="none" stroke="#e11d48" strokeWidth="4" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} strokeLinecap="round" />
                ) : null}
              </svg>
              <span
                className={`block transition-all duration-200 ${
                  mode === 'photo'
                    ? 'h-16 w-16 rounded-full bg-white active:scale-90'
                    : isRecording
                      ? 'h-8 w-8 rounded-md bg-rose-600'
                      : 'h-16 w-16 rounded-full bg-rose-600'
                }`}
              />
            </button>

            <button
              type="button"
              onClick={() => setFacing((current) => (current === 'environment' ? 'user' : 'environment'))}
              disabled={isRecording}
              aria-label="Virar a câmera"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.7M20 4v4.7h-4.7M20 12a8 8 0 0 1-13.7 5.6L4 15.3M4 20v-4.7h4.7" />
              </svg>
            </button>
          </div>
          <p className="mt-4 text-center text-xs text-white/55">
            {mode === 'photo' ? 'Toque para tirar a foto' : isRecording ? 'Toque para parar' : `Toque para gravar (até ${MAX_RECORD_SECONDS} s)`}
          </p>
        </div>
      </div>
    </Portal>
  );
}
