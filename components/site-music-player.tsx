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

type PageTrack = { id: string; title: string; artist?: string | null; url: string } | null;
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
  // Cada toque no player adia o fechamento automático.
  const [interaction, setInteraction] = useState(0);

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

  // Aberto e sem uso por 6 s: volta a ser só o disco (não fecha enquanto mexe no volume).
  useEffect(() => {
    if (isAdminRoute || isCollapsed || isVolumeOpen || isVolumeInteracting) {
      return;
    }

    const collapseTimer = window.setTimeout(() => {
      setIsCollapsed(true);
    }, 6000);

    return () => window.clearTimeout(collapseTimer);
  }, [isAdminRoute, pathname, isCollapsed, isVolumeOpen, isVolumeInteracting, interaction]);

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

  // Nome da música desta página (aparece em "Tocando agora").
  const currentTrack = config && pageTrackUrl ? Object.values(config.pages).find((page) => page?.url === pageTrackUrl) : null;
  const trackTitle = currentTrack?.title ?? 'Música original do site';
  // Autoria (artista/compositor): aparece no player por cuidado com o direito de uso.
  const trackArtist = currentTrack?.artist?.trim() || null;

  if (isAdminRoute) {
    return null;
  }

  const volumePercent = Math.round(volume * 100);
  const spring = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } as const;

  return (
    // Página "sem música": o player some, mas o áudio continua montado (para voltar do mesmo ponto).
    <div className={`fixed left-5 top-[22px] z-[60] sm:left-7 sm:top-[26px] ${hasMusic ? '' : 'hidden'}`} aria-hidden={!hasMusic}>
      <motion.div
        layout
        transition={spring}
        className={`music-pill relative flex items-center ${isCollapsed ? 'gap-0 p-1' : 'gap-2.5 p-1 pr-2 sm:gap-3'}`}
        style={{ borderRadius: 999 }}
        // Qualquer toque, clique ou tecla no player adia o fechamento automático.
        onPointerDownCapture={() => setInteraction((value) => value + 1)}
        onClickCapture={() => setInteraction((value) => value + 1)}
        onKeyDownCapture={() => setInteraction((value) => value + 1)}
      >
        {/* Disco: abre/fecha o player. Gira tocando; brilho pulsando em volta. */}
        <motion.button
          layout="position"
          type="button"
          onClick={() => setIsCollapsed((current) => !current)}
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          aria-label={isCollapsed ? 'Abrir o player de música' : 'Fechar o player de música'}
          aria-expanded={!isCollapsed}
          whileTap={{ scale: 0.92 }}
        >
          <AnimatePresence>
            {isMusicPlaying ? (
              <motion.span
                key="halo"
                className="music-halo pointer-events-none absolute inset-0 rounded-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.55, 0], scale: [1, 1.55] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2.4, ease: 'easeOut', repeat: Infinity }}
              />
            ) : null}
          </AnimatePresence>
          <motion.span
            className="music-disc relative block h-10 w-10 rounded-full"
            animate={isMusicPlaying ? { rotate: 360 } : { rotate: 0 }}
            transition={isMusicPlaying ? { duration: 3.2, ease: 'linear', repeat: Infinity } : { duration: 0.6, ease: 'easeOut' }}
          />
        </motion.button>

        <AnimatePresence initial={false}>
          {!isCollapsed ? (
            <motion.div
              key="controls"
              initial={{ opacity: 0, x: -8, filter: 'blur(4px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="flex items-center gap-2.5 sm:gap-3"
            >
              {/* Tocando agora + nome da música (desliza quando é longo) */}
              <div className="min-w-0 w-[7.5rem] sm:w-[10rem]">
                <p className="flex items-center gap-1.5 whitespace-nowrap text-[0.55rem] font-medium uppercase tracking-[0.16em] text-champagne-700/80 sm:tracking-[0.22em]">
                  <span className="flex h-2.5 items-end gap-[2px]" aria-hidden="true">
                    {[0, 1, 2, 3].map((bar) => (
                      <span
                        key={bar}
                        className={`music-eq-bar w-[2px] rounded-full ${isMusicPlaying ? '' : 'music-eq-bar--idle'}`}
                        style={{ animationDelay: `${bar * -0.27}s` }}
                      />
                    ))}
                  </span>
                  {isMusicPlaying ? 'Tocando agora' : 'Em pausa'}
                </p>
                {/* Nome da música (desliza quando é longo) e, embaixo, a autoria. */}
                <div className={`${trackTitle.length > 18 ? 'music-marquee ' : ''}mt-0.5 overflow-hidden whitespace-nowrap font-display text-[0.95rem] italic leading-tight text-zinc-800`}>
                  <span className={trackTitle.length > 18 ? 'music-marquee-track' : ''}>
                    {trackTitle}
                    {trackTitle.length > 18 ? <span aria-hidden="true">{'  ✦  ' + trackTitle}</span> : null}
                  </span>
                </div>
                {trackArtist ? (
                  <div
                    className={`${trackArtist.length > 26 ? 'music-marquee ' : ''}overflow-hidden whitespace-nowrap text-[0.62rem] leading-tight text-zinc-600`} title={`Autoria: ${trackArtist}`}>
                    <span className={trackArtist.length > 26 ? 'music-marquee-track' : ''}>
                      por {trackArtist}
                      {trackArtist.length > 26 ? <span aria-hidden="true">{'  ·  por ' + trackArtist}</span> : null}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* Play / pausa */}
              <motion.button
                type="button"
                onClick={togglePlayback}
                whileTap={{ scale: 0.88 }}
                className="music-play flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#fff9f1]"
                aria-label={isMusicPlaying ? 'Pausar música' : 'Tocar música'}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isMusicPlaying ? (
                    <motion.svg
                      key="pause"
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      initial={{ scale: 0.4, opacity: 0, rotate: -90 }}
                      animate={{ scale: 1, opacity: 1, rotate: 0 }}
                      exit={{ scale: 0.4, opacity: 0, rotate: 90 }}
                      transition={{ duration: 0.18 }}
                      aria-hidden="true"
                    >
                      <rect x="6.5" y="5" width="3.6" height="14" rx="1.4" fill="currentColor" />
                      <rect x="13.9" y="5" width="3.6" height="14" rx="1.4" fill="currentColor" />
                    </motion.svg>
                  ) : (
                    <motion.svg
                      key="play"
                      viewBox="0 0 24 24"
                      className="h-4 w-4 translate-x-[1px]"
                      initial={{ scale: 0.4, opacity: 0, rotate: 90 }}
                      animate={{ scale: 1, opacity: 1, rotate: 0 }}
                      exit={{ scale: 0.4, opacity: 0, rotate: -90 }}
                      transition={{ duration: 0.18 }}
                      aria-hidden="true"
                    >
                      <path d="M8 5.6v12.8c0 .8.9 1.3 1.6.9l10-6.4a1 1 0 0 0 0-1.8l-10-6.4C8.9 4.3 8 4.8 8 5.6Z" fill="currentColor" />
                    </motion.svg>
                  )}
                </AnimatePresence>
              </motion.button>

              {/* Volume */}
              <div className="relative">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.88 }}
                  onClick={() => {
                    setIsVolumeInteracting(false);
                    setIsVolumeOpen((current) => !current);
                  }}
                  className="music-icon-btn flex h-9 w-9 items-center justify-center rounded-full"
                  aria-label={`Volume ${volumePercent}%`}
                  aria-expanded={isVolumeOpen}
                >
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" stroke="none" />
                    {volume === 0 ? (
                      <path d="m16 9.5 5 5m0-5-5 5" />
                    ) : (
                      <>
                        <path d="M15.5 9.2a4 4 0 0 1 0 5.6" opacity={volume > 0 ? 1 : 0.25} />
                        <path d="M18.3 6.6a7.6 7.6 0 0 1 0 10.8" opacity={volume > 0.45 ? 1 : 0.25} />
                      </>
                    )}
                  </svg>
                </motion.button>
                <AnimatePresence>
                  {isVolumeOpen ? (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.95 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="music-volume-pop absolute right-0 top-[calc(100%+0.6rem)] flex w-48 items-center gap-3 rounded-2xl px-4 py-3"
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
                        className="music-range flex-1"
                        style={{ ['--fill' as string]: `${volumePercent}%` }}
                        aria-label="Volume da música"
                      />
                      <span className="w-8 text-right text-[0.7rem] font-medium tabular-nums text-champagne-700">{volumePercent}%</span>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
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
      </motion.div>
    </div>
  );
}
