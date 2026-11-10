"use client";

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { INTRO_ENTER_EVENT } from '@/components/intro-arco';

const MUSIC_STATE_KEY = 'igor-bianca-music';
/** Disparado pela câmera do mural ao começar (detail: true) e terminar (false) uma gravação. */
export const MEDIA_RECORDING_EVENT = 'igor-bianca:recording';

export function SiteMusicPlayer() {
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // A música foi pausada pelo site (vídeo com som/gravação), não pela pessoa: volta sozinha depois.
  const pausedForMediaRef = useRef(false);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [volume, setVolume] = useState(0.25);
  const [isVolumeOpen, setIsVolumeOpen] = useState(false);
  const [isVolumeInteracting, setIsVolumeInteracting] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Sem player no admin e no telão do mural (projetado na festa).
  const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/mural/telao');

  const startPlayback = useCallback(
    async (allowMutedFallback: boolean) => {
      const audioElement = audioRef.current;

      if (!audioElement) {
        return false;
      }

      audioElement.volume = volume;
      audioElement.muted = false;

      try {
        await audioElement.play();
        setIsMusicPlaying(true);
        return true;
      } catch {
        if (!allowMutedFallback) {
          setIsMusicPlaying(false);
          return false;
        }

        try {
          audioElement.muted = true;
          await audioElement.play();
          audioElement.volume = volume;
          audioElement.muted = false;
          setIsMusicPlaying(true);
          return true;
        } catch {
          setIsMusicPlaying(false);
          return false;
        }
      }
    },
    [volume]
  );

  useEffect(() => {
    const audioElement = audioRef.current;

    if (!audioElement) {
      return;
    }

    audioElement.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audioElement = audioRef.current;

    if (!audioElement) {
      return;
    }

    if (isAdminRoute) {
      audioElement.pause();
      setIsMusicPlaying(false);
      setIsVolumeOpen(false);
      return;
    }

    if (!audioElement.paused) {
      setIsMusicPlaying(true);
    }
  }, [isAdminRoute, pathname]);

  useEffect(() => {
    if (isAdminRoute) {
      return;
    }

    const handleIntroEnter = () => {
      const audioElement = audioRef.current;

      if (audioElement && audioElement.paused) {
        void startPlayback(false);
      }
    };

    window.addEventListener(INTRO_ENTER_EVENT, handleIntroEnter);

    return () => window.removeEventListener(INTRO_ENTER_EVENT, handleIntroEnter);
  }, [isAdminRoute, startPlayback]);

  // Lembra se a música estava tocando (e em que ponto) para continuar ao abrir outra página do site por fora
  // da navegação (QR Code do telão, link no WhatsApp, nova aba, recarregar). Se o navegador bloquear o som
  // automático, a música volta no primeiro toque na tela. Quem pausou de propósito continua com ela pausada.
  useEffect(() => {
    if (isAdminRoute) return;
    const audioElement = audioRef.current;
    if (!audioElement) return;

    let saved: { on?: boolean; t?: number } | null = null;
    try {
      saved = JSON.parse(window.localStorage.getItem(MUSIC_STATE_KEY) || 'null');
    } catch {
      saved = null;
    }

    const save = () => {
      try {
        window.localStorage.setItem(
          MUSIC_STATE_KEY,
          JSON.stringify({ on: !audioElement.paused || pausedForMediaRef.current, t: audioElement.currentTime })
        );
      } catch {
        // Sem armazenamento: só não lembra.
      }
    };
    audioElement.addEventListener('play', save);
    audioElement.addEventListener('pause', save);
    const saveTimer = window.setInterval(() => !audioElement.paused && save(), 4000);

    let removeGestureListeners = () => {};
    if (saved?.on && audioElement.paused) {
      if (typeof saved.t === 'number' && saved.t > 0) {
        try {
          audioElement.currentTime = saved.t;
        } catch {
          // Ainda sem metadados: começa do início.
        }
      }
      void startPlayback(false).then((started) => {
        if (started) return;
        const resumeOnGesture = () => {
          removeGestureListeners();
          if (audioElement.paused) void startPlayback(true);
        };
        const events = ['pointerdown', 'keydown', 'touchend'] as const;
        events.forEach((name) => window.addEventListener(name, resumeOnGesture, { once: true, capture: true }));
        removeGestureListeners = () => events.forEach((name) => window.removeEventListener(name, resumeOnGesture, { capture: true }));
      });
    }

    return () => {
      removeGestureListeners();
      window.clearInterval(saveTimer);
      audioElement.removeEventListener('play', save);
      audioElement.removeEventListener('pause', save);
    };
    // Só ao abrir o site (o player continua montado entre as páginas).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminRoute]);

  // Vídeo com som (ex.: post do mural) ou gravação pela câmera: a música pausa e volta sozinha ao terminar.
  useEffect(() => {
    if (isAdminRoute) return;
    const audioElement = audioRef.current;
    if (!audioElement) return;
    let activeVideo: HTMLVideoElement | null = null;
    let recording = false;

    const pauseForMedia = () => {
      if (!audioElement.paused) {
        pausedForMediaRef.current = true;
        audioElement.pause();
      }
    };
    const resumeAfterMedia = () => {
      if (!pausedForMediaRef.current || recording) return;
      if (activeVideo && activeVideo.isConnected && !activeVideo.paused && !activeVideo.muted) return;
      activeVideo = null;
      pausedForMediaRef.current = false;
      void startPlayback(true);
    };
    const isAudibleVideo = (target: EventTarget | null): target is HTMLVideoElement =>
      target instanceof HTMLVideoElement && !target.muted && target.volume > 0;

    const onPlay = (event: Event) => {
      if (isAudibleVideo(event.target) && !event.target.paused) {
        activeVideo = event.target;
        pauseForMedia();
      }
    };
    const onStop = (event: Event) => {
      if (event.target === activeVideo) resumeAfterMedia();
    };
    const onVolume = (event: Event) => {
      const video = event.target;
      if (!(video instanceof HTMLVideoElement) || video.paused) return;
      if (isAudibleVideo(video)) {
        activeVideo = video;
        pauseForMedia();
      } else if (video === activeVideo) {
        resumeAfterMedia();
      }
    };
    const onRecording = (event: Event) => {
      recording = (event as CustomEvent<boolean>).detail === true;
      if (recording) pauseForMedia();
      else resumeAfterMedia();
    };

    document.addEventListener('play', onPlay, true);
    document.addEventListener('pause', onStop, true);
    document.addEventListener('ended', onStop, true);
    document.addEventListener('volumechange', onVolume, true);
    window.addEventListener(MEDIA_RECORDING_EVENT, onRecording);
    // Vídeo fechado (janela do post saiu da tela) sem disparar "pause".
    const watcher = window.setInterval(() => {
      if (activeVideo && !activeVideo.isConnected) resumeAfterMedia();
    }, 800);

    return () => {
      document.removeEventListener('play', onPlay, true);
      document.removeEventListener('pause', onStop, true);
      document.removeEventListener('ended', onStop, true);
      document.removeEventListener('volumechange', onVolume, true);
      window.removeEventListener(MEDIA_RECORDING_EVENT, onRecording);
      window.clearInterval(watcher);
    };
  }, [isAdminRoute, startPlayback]);

  useEffect(() => {
    if (isCollapsed) {
      setIsVolumeOpen(false);
      setIsVolumeInteracting(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    if (isAdminRoute) {
      return;
    }

    const collapseTimer = window.setTimeout(() => {
      setIsCollapsed(true);
    }, 6000);

    return () => window.clearTimeout(collapseTimer);
  }, [isAdminRoute, pathname]);

  useEffect(() => {
    if (!isVolumeOpen || isVolumeInteracting) {
      return;
    }

    const closeTimer = window.setTimeout(() => {
      setIsVolumeOpen(false);
    }, 4000);

    return () => window.clearTimeout(closeTimer);
  }, [isVolumeOpen, isVolumeInteracting]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 639px)');

    const syncViewport = () => {
      const mobile = mediaQuery.matches;
      setIsMobile(mobile);

      if (mobile) {
        setIsCollapsed(true);
      }
    };

    syncViewport();
    mediaQuery.addEventListener('change', syncViewport);

    return () => mediaQuery.removeEventListener('change', syncViewport);
  }, []);

  const togglePlayback = async () => {
    const audioElement = audioRef.current;

    if (!audioElement) {
      return;
    }

    if (audioElement.paused) {
      pausedForMediaRef.current = false;
      await startPlayback(isMobile);
      return;
    }

    // Pausa feita pela pessoa: não volta sozinha depois de vídeos.
    pausedForMediaRef.current = false;
    audioElement.pause();
    setIsMusicPlaying(false);
  };

  const handleVolumeChange = (nextVolume: number) => {
    const normalized = Math.min(1, Math.max(0, nextVolume));
    setVolume(normalized);

    if (audioRef.current) {
      audioRef.current.volume = normalized;
    }
  };

  if (isAdminRoute) {
    return null;
  }

  return (
    <div className="gold-frame fixed left-7 top-[30px] z-[60] w-fit max-w-[calc(100vw-1rem)] rounded-xl bg-white/65 px-2 py-2 text-[0.62rem] uppercase tracking-[0.18em] text-zinc-700 backdrop-blur-md sm:left-8 sm:px-3 sm:text-[0.68rem]">
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => setIsCollapsed((current) => !current)}
          className="login-audio-btn flex h-8 w-8 items-center justify-center p-0"
          aria-label={isCollapsed ? 'Expandir player' : 'Retrair player'}
        >
          {isCollapsed ? (
            <motion.span
              className="login-audio-disc"
              animate={isMusicPlaying ? { rotate: 360 } : { rotate: 0 }}
              transition={
                isMusicPlaying
                  ? { duration: 2.2, ease: 'linear', repeat: Infinity }
                  : { duration: 0.35, ease: 'easeOut' }
              }
            />
          ) : (
            '<'
          )}
        </button>

        <AnimatePresence initial={false}>
          {!isCollapsed ? (
            <motion.div
              initial={{ opacity: 0, x: -10, width: 0 }}
              animate={{ opacity: 1, x: 0, width: 'auto' }}
              exit={{ opacity: 0, x: -10, width: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="overflow-visible"
            >
              <div className="login-audio-shell">
                <motion.span
                  className="login-audio-disc"
                  animate={isMusicPlaying ? { rotate: 360 } : { rotate: 0 }}
                  transition={
                    isMusicPlaying
                      ? { duration: 2.2, ease: 'linear', repeat: Infinity }
                      : { duration: 0.35, ease: 'easeOut' }
                  }
                />
                <button
                  type="button"
                  onClick={togglePlayback}
                  className="login-audio-btn"
                  aria-label={isMusicPlaying ? 'Pausar musica' : 'Tocar musica'}
                >
                  {isMusicPlaying ? 'Pause' : 'Play'}
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsVolumeInteracting(false);
                      setIsVolumeOpen((current) => !current);
                    }}
                    className="login-audio-btn"
                    aria-label="Abrir controle de volume"
                  >
                    {isMobile ? `V ${Math.round(volume * 100)}%` : `Vol ${Math.round(volume * 100)}%`}
                  </button>
                  <AnimatePresence>
                    {isVolumeOpen ? (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="login-volume-popover"
                        onPointerEnter={() => setIsVolumeInteracting(true)}
                        onPointerLeave={() => setIsVolumeInteracting(false)}
                        onPointerDown={() => setIsVolumeInteracting(true)}
                        onPointerUp={() => setIsVolumeInteracting(false)}
                        onFocusCapture={() => setIsVolumeInteracting(true)}
                        onBlurCapture={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                            setIsVolumeInteracting(false);
                          }
                        }}
                      >
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={volume}
                          onChange={(event) => handleVolumeChange(Number(event.target.value))}
                          onPointerDown={() => setIsVolumeInteracting(true)}
                          onPointerUp={() => setIsVolumeInteracting(false)}
                          onFocus={() => setIsVolumeInteracting(true)}
                          onBlur={() => setIsVolumeInteracting(false)}
                          className="login-volume-slider"
                          aria-label="Controle de volume"
                        />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <audio
          ref={audioRef}
          loop
          playsInline
          preload="auto"
          onLoadedMetadata={() => {
            if (audioRef.current) {
              audioRef.current.volume = volume;
            }
          }}
          onPlay={() => setIsMusicPlaying(true)}
          onPause={() => setIsMusicPlaying(false)}
          onEnded={() => setIsMusicPlaying(false)}
          className="sr-only"
          aria-label="Player de musica de fundo"
        >
          <source src="/sons/musica-fundo.mp3" type="audio/mpeg" />
          Seu navegador nao suporta audio.
        </audio>
      </div>
    </div>
  );
}