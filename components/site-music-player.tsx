"use client";

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const FIRST_VISIT_AUTOPLAY_KEY = 'igb-first-login-autoplay';

export function SiteMusicPlayer() {
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [volume, setVolume] = useState(0.25);
  const [isVolumeOpen, setIsVolumeOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const isAdminRoute = pathname.startsWith('/admin');

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

    if (pathname !== '/login') {
      return;
    }

    if (!audioElement.paused) {
      setIsMusicPlaying(true);
      return;
    }

    const wasFirstVisitHandled = window.localStorage.getItem(FIRST_VISIT_AUTOPLAY_KEY) === '1';

    const markFirstVisitHandled = () => {
      window.localStorage.setItem(FIRST_VISIT_AUTOPLAY_KEY, '1');
    };

    const tryStartPlayback = async (allowMutedFallback: boolean) => {
      audioElement.volume = volume;
      audioElement.muted = false;

      try {
        await audioElement.play();
        setIsMusicPlaying(true);
        markFirstVisitHandled();
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
          markFirstVisitHandled();
          return true;
        } catch {
          setIsMusicPlaying(false);
          return false;
        }
      }
    };

    const interactionEvents: Array<keyof WindowEventMap> = ['pointerdown', 'touchstart', 'keydown'];

    const handleFirstInteraction = () => {
      void tryStartPlayback(false).finally(() => {
        interactionEvents.forEach((eventName) => {
          window.removeEventListener(eventName, handleFirstInteraction);
        });
      });
    };

    void tryStartPlayback(!wasFirstVisitHandled).then((started) => {
      if (!started) {
        interactionEvents.forEach((eventName) => {
          window.addEventListener(eventName, handleFirstInteraction, { once: true });
        });
      }
    });

    return () => {
      interactionEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleFirstInteraction);
      });
    };
  }, [isAdminRoute, pathname]);

  useEffect(() => {
    if (isCollapsed) {
      setIsVolumeOpen(false);
    }
  }, [isCollapsed]);

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
      try {
        await audioElement.play();
        setIsMusicPlaying(true);
      } catch {
        setIsMusicPlaying(false);
      }
      return;
    }

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
    <div className="gold-frame fixed left-2 top-[4.3rem] z-50 w-fit max-w-[calc(100vw-1rem)] rounded-xl bg-white/65 px-2 py-2 text-[0.62rem] uppercase tracking-[0.18em] text-zinc-700 backdrop-blur-md sm:left-4 sm:top-4 sm:px-3 sm:text-[0.68rem]">
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => setIsCollapsed((current) => !current)}
          className="login-audio-btn"
          aria-label={isCollapsed ? 'Expandir player' : 'Retrair player'}
        >
          {isCollapsed ? '>' : '<'}
        </button>

        <AnimatePresence initial={false}>
          {!isCollapsed ? (
            <motion.div
              initial={{ opacity: 0, x: -10, width: 0 }}
              animate={{ opacity: 1, x: 0, width: 'auto' }}
              exit={{ opacity: 0, x: -10, width: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="overflow-hidden"
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
                    onClick={() => setIsVolumeOpen((current) => !current)}
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
                      >
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={volume}
                          onChange={(event) => handleVolumeChange(Number(event.target.value))}
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
          autoPlay
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