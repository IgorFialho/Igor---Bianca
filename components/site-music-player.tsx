"use client";

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { INTRO_ENTER_EVENT } from '@/components/intro-arco';

const MUSIC_STATE_KEY = 'igor-bianca-music';
/** Disparado pela câmera do mural ao começar (detail: true) e terminar (false) uma gravação. */
export const MEDIA_RECORDING_EVENT = 'igor-bianca:recording';

// Música original do site: usada enquanto a configuração do painel não chega (e se ela falhar).
const DEFAULT_MUSIC_URL = '/sons/musica-fundo.mp3';

type PageTrack = { id: string; title: string; url: string } | null;
type MusicConfig = { mode: 'single' | 'per_page'; pages: Record<string, PageTrack> };

/** Qual configuração do painel vale para a página aberta (o /rsvp faz parte do convite). */
function musicPageKey(pathname: string) {
  if (pathname.startsWith('/login')) return 'login';
  if (pathname.startsWith('/convite') || pathname.startsWith('/rsvp')) return 'convite';
  if (pathname.startsWith('/presentes')) return 'presentes';
  if (pathname.startsWith('/mural')) return 'mural';
  return null;
}

export function SiteMusicPlayer() {
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // A música foi pausada pelo site (vídeo com som/gravação), não pela pessoa: volta sozinha depois.
  const pausedForMediaRef = useRef(false);
  // Página "sem música": pausou só por causa da página; volta ao abrir uma página com música.
  const pausedForPageRef = useRef(false);
  const [config, setConfig] = useState<MusicConfig | null>(null);
  const currentSrcRef = useRef<string | null>(null);
  const restoredRef = useRef(false);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [volume, setVolume] = useState(0.25);
  const [isVolumeOpen, setIsVolumeOpen] = useState(false);
  const [isVolumeInteracting, setIsVolumeInteracting] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Sem player no admin e no telão do mural (projetado na festa).
  const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/mural/telao');

  // Música desta página: a do painel; antes de carregar (ou se falhar), a original. Página fora da lista mantém a atual.
  // A configuração demorou ou falhou: segue com a música original (como o site sempre funcionou).
  const [useFallback, setUseFallback] = useState(false);
  // Entrou pela introdução antes de a configuração chegar: a música começa assim que ela chegar.
  const pendingStartRef = useRef(false);
  const pageKey = musicPageKey(pathname);
  const lastTrackRef = useRef<string | null>(DEFAULT_MUSIC_URL);
  // undefined = ainda esperando a configuração.
  let pageTrackUrl: string | null | undefined;
  if (!config) pageTrackUrl = useFallback ? DEFAULT_MUSIC_URL : undefined;
  else if (pageKey) pageTrackUrl = config.pages[pageKey]?.url ?? null;
  else pageTrackUrl = lastTrackRef.current;
  if (pageTrackUrl !== undefined) lastTrackRef.current = pageTrackUrl;
  const hasMusic = pageTrackUrl !== null;

  // Configuração do painel (de novo ao voltar para a aba, para pegar mudanças feitas no painel).
  useEffect(() => {
    if (isAdminRoute) return;
    let cancelled = false;
    const fallbackTimer = window.setTimeout(() => setUseFallback(true), 3000);
    const load = () =>
      fetch('/api/music', { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (cancelled) return;
          if (data?.pages) setConfig(data);
          else setUseFallback(true);
        })
        .catch(() => !cancelled && setUseFallback(true));
    load();
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isAdminRoute]);

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

      // Entrada pela introdução (/login): a música começa aqui, como sempre — se a página tiver música.
      if (!audioElement || !audioElement.paused) return;
      if (audioElement.getAttribute('src')) void startPlayback(false);
      else pendingStartRef.current = true;
    };

    window.addEventListener(INTRO_ENTER_EVENT, handleIntroEnter);

    return () => window.removeEventListener(INTRO_ENTER_EVENT, handleIntroEnter);
  }, [isAdminRoute, startPlayback]);

  // Lembra se a música estava tocando (e em que ponto) para continuar ao abrir outra página do site por fora
  // da navegação (QR Code do telão, link no WhatsApp, nova aba, recarregar). Se o navegador bloquear o som
  // automático, a música volta no primeiro toque na tela. Quem pausou de propósito continua com ela pausada.
  const removeGestureListenersRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (isAdminRoute) return;
    const audioElement = audioRef.current;
    if (!audioElement) return;

    const save = () => {
      try {
        window.localStorage.setItem(
          MUSIC_STATE_KEY,
          JSON.stringify({
            on: !audioElement.paused || pausedForMediaRef.current || pausedForPageRef.current,
            t: audioElement.currentTime,
            src: currentSrcRef.current,
          })
        );
      } catch {
        // Sem armazenamento: só não lembra.
      }
    };
    audioElement.addEventListener('play', save);
    audioElement.addEventListener('pause', save);
    const saveTimer = window.setInterval(() => !audioElement.paused && save(), 4000);

    return () => {
      removeGestureListenersRef.current();
      window.clearInterval(saveTimer);
      audioElement.removeEventListener('play', save);
      audioElement.removeEventListener('pause', save);
    };
  }, [isAdminRoute]);

  /** Ao abrir o site: se a música estava tocando, continua (no mesmo ponto, se for a mesma música). */
  const restoreSavedState = useCallback(
    (audioElement: HTMLAudioElement, src: string) => {
      let saved: { on?: boolean; t?: number; src?: string | null } | null = null;
      try {
        saved = JSON.parse(window.localStorage.getItem(MUSIC_STATE_KEY) || 'null');
      } catch {
        saved = null;
      }
      if (!saved?.on || !audioElement.paused) return;
      const sameTrack = (saved.src ?? DEFAULT_MUSIC_URL) === src;
      const resumeAt = sameTrack && typeof saved.t === 'number' && saved.t > 0 ? saved.t : 0;
      if (resumeAt) {
        // A música acabou de ser carregada: o ponto só pode ser aplicado depois que o navegador lê a duração.
        const seek = () => {
          try {
            if (audioElement.getAttribute('src') === src && audioElement.currentTime < 1) audioElement.currentTime = resumeAt;
          } catch {
            // Sem como pular: começa do início.
          }
        };
        if (audioElement.readyState >= 1) seek();
        else audioElement.addEventListener('loadedmetadata', seek, { once: true });
      }
      void startPlayback(false).then((started) => {
        if (started) return;
        // Navegador bloqueou o som automático: volta no primeiro toque na tela.
        const resumeOnGesture = () => {
          removeGestureListenersRef.current();
          if (audioElement.paused && audioElement.getAttribute('src')) void startPlayback(true);
        };
        const events = ['pointerdown', 'keydown', 'touchend'] as const;
        events.forEach((name) => window.addEventListener(name, resumeOnGesture, { once: true, capture: true }));
        removeGestureListenersRef.current = () => {
          events.forEach((name) => window.removeEventListener(name, resumeOnGesture, { capture: true }));
          removeGestureListenersRef.current = () => undefined;
        };
      });
    },
    [startPlayback]
  );

  // Troca de página: mesma música → continua tocando; música diferente → troca (tocando, se estava tocando);
  // página "sem música" → pausa e volta ao entrar numa página com música.
  useEffect(() => {
    if (isAdminRoute) {
      // O player sai da tela no painel; ao voltar, o áudio é outro e precisa receber a música de novo.
      currentSrcRef.current = null;
      restoredRef.current = false;
      return;
    }
    const audioElement = audioRef.current;
    if (!audioElement || pageTrackUrl === undefined) return;

    if (pageTrackUrl === null) {
      pendingStartRef.current = false;
      removeGestureListenersRef.current();
      if (!audioElement.paused || pausedForMediaRef.current) {
        pausedForPageRef.current = true;
        pausedForMediaRef.current = false;
        audioElement.pause();
      }
      return;
    }

    if (currentSrcRef.current !== pageTrackUrl) {
      const wasOn = currentSrcRef.current !== null && (!audioElement.paused || pausedForPageRef.current || pausedForMediaRef.current);
      currentSrcRef.current = pageTrackUrl;
      pausedForPageRef.current = false;
      pausedForMediaRef.current = false;
      audioElement.src = pageTrackUrl;
      audioElement.load();
      if (pendingStartRef.current) {
        pendingStartRef.current = false;
        restoredRef.current = true;
        void startPlayback(true);
      } else if (!restoredRef.current) {
        restoredRef.current = true;
        restoreSavedState(audioElement, pageTrackUrl);
      } else if (wasOn) {
        void startPlayback(true);
      }
      return;
    }

    if (pausedForPageRef.current) {
      pausedForPageRef.current = false;
      void startPlayback(true);
    }
  }, [pageTrackUrl, isAdminRoute, startPlayback, restoreSavedState]);

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
      pausedForPageRef.current = false;
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
    // Página "sem música": o player some, mas o áudio continua montado (para voltar do mesmo ponto).
    <div
      className={`gold-frame fixed left-7 top-[30px] z-[60] w-fit max-w-[calc(100vw-1rem)] rounded-xl bg-white/65 px-2 py-2 text-[0.62rem] uppercase tracking-[0.18em] text-zinc-700 backdrop-blur-md sm:left-8 sm:px-3 sm:text-[0.68rem] ${
        hasMusic ? '' : 'hidden'
      }`}
      aria-hidden={!hasMusic}
    >
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
          {/* A música (src) é definida conforme a página, pela configuração do painel. */}
          Seu navegador nao suporta audio.
        </audio>
      </div>
    </div>
  );
}