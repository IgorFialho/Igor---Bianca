"use client";

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function SplashScreen() {
  const [isVisible, setIsVisible] = useState(true);
  const petals = Array.from({ length: 14 }, (_, index) => ({
    id: index,
    left: `${(index * 7 + 6) % 100}%`,
    duration: 7 + (index % 5),
    delay: index * 0.18,
    size: 5 + (index % 4),
  }));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsVisible(false);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {isVisible ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-cream/95"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, filter: 'blur(14px)' }}
          transition={{ duration: 0.75, ease: 'easeInOut' }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_5%,rgba(214,144,172,0.2),transparent_38%),radial-gradient(circle_at_90%_88%,rgba(132,156,106,0.2),transparent_38%),linear-gradient(180deg,rgba(248,243,234,0.97),rgba(244,237,226,0.95))]" />
          <span className="bouquet-corner left-[-44px] top-[-56px]" />
          <span className="bouquet-corner bottom-[-54px] right-[-40px]" />

          {petals.map((petal) => (
            <motion.span
              key={petal.id}
              className="absolute rounded-full bg-gradient-to-br from-teaRose-200/75 to-champagne-200/70"
              style={{ left: petal.left, top: '-10%', width: petal.size * 1.8, height: petal.size * 1.2 }}
              initial={{ y: -40, opacity: 0, rotate: 0 }}
              animate={{ y: '115vh', opacity: [0, 0.8, 0.55, 0], rotate: [0, 100, 170] }}
              transition={{
                duration: petal.duration,
                delay: petal.delay,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
          ))}

          <div className="relative flex flex-col items-center gap-8 px-6 text-center">
            {/* Framer Motion: initials animate in with a soft scale-up and fade. */}
            <motion.div
              initial={{ opacity: 0, scale: 0.84, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 }}
              className="flex flex-col items-center gap-5"
            >
              <div className="gold-frame relative flex h-44 w-44 items-center justify-center rounded-full bg-white/60 backdrop-blur-lg shadow-floral">
                <div className="absolute inset-4 rounded-full border border-champagne-500/30" />
                <span className="font-display text-5xl tracking-[0.35em] text-champagne-700 sm:text-6xl">
                  Igor e Bianca
                </span>
              </div>
              <div className="space-y-2">
                <p className="max-w-sm font-display text-[2.05rem] leading-tight text-champagne-800 sm:text-[2.5rem]">
                  O Amor Floresce.
                </p>
                <p className="text-lg text-zinc-700/85">[Igor e Bianca]. Aguarde...</p>
                <p className="text-xs uppercase tracking-[0.45em] text-champagne-700/75">
                  Convite exclusivo
                </p>
              </div>
            </motion.div>

            <div className="relative h-10 w-72 sm:w-96">
              {/* Framer Motion: floral stroke expands to frame the crest reveal. */}
              <motion.span
                className="absolute left-0 top-1/2 h-px w-full origin-center bg-gradient-to-r from-transparent via-champagne-500/80 to-transparent"
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ duration: 0.85, ease: 'easeInOut', delay: 0.45 }}
              />
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
