"use client";

import { motion } from 'framer-motion';

const petals = Array.from({ length: 18 }, (_, index) => ({
  id: index,
  left: `${(index * 11 + 7) % 100}%`,
  delay: index * 0.24,
  duration: 8 + (index % 5),
  size: 10 + (index % 4) * 3,
}));

const dust = Array.from({ length: 26 }, (_, index) => ({
  id: index,
  left: `${(index * 13 + 9) % 100}%`,
  top: `${(index * 7 + 11) % 100}%`,
  delay: index * 0.2,
  duration: 4 + (index % 4),
}));

export function SaveTheDateCinematic() {
  return (
    <section className="frosted-light gold-frame relative overflow-hidden rounded-[1.4rem] p-0">
      {/* Framer Motion: cinematic camera drift over 15 seconds for a video-like movement. */}
      <motion.div
        className="relative aspect-video w-full overflow-hidden"
        initial={{ scale: 1.02, x: -6, y: 4 }}
        animate={{ scale: 1.08, x: 10, y: -8 }}
        transition={{ duration: 15, ease: 'easeInOut', repeat: Infinity, repeatType: 'mirror' }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(160deg,#fcf8f0_0%,#f8f1e4_48%,#f5ede0_100%)]" />
        <div className="absolute inset-0 opacity-50 [background-image:radial-gradient(circle_at_2px_2px,rgba(156,131,102,0.16)_1px,transparent_0)] [background-size:14px_14px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_12%,rgba(239,188,208,0.32),transparent_34%),radial-gradient(circle_at_86%_84%,rgba(170,196,142,0.26),transparent_36%),radial-gradient(circle_at_85%_12%,rgba(198,183,235,0.24),transparent_34%)]" />

        {/* Framer Motion: watercolor floral corners grow softly as the scene opens. */}
        <motion.div
          className="absolute -left-10 -top-10 h-56 w-56 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(245,170,199,0.65),transparent_55%),radial-gradient(circle_at_70%_35%,rgba(203,189,241,0.6),transparent_50%),radial-gradient(circle_at_55%_75%,rgba(174,202,146,0.5),transparent_52%)] blur-[1px]"
          initial={{ opacity: 0, scale: 0.65 }}
          animate={{ opacity: 0.95, scale: 1 }}
          transition={{ duration: 2.2, ease: 'easeOut' }}
        />
        <motion.div
          className="absolute -bottom-12 -right-10 h-64 w-64 rounded-full bg-[radial-gradient(circle_at_65%_38%,rgba(246,180,208,0.6),transparent_55%),radial-gradient(circle_at_35%_60%,rgba(194,180,236,0.54),transparent_55%),radial-gradient(circle_at_75%_78%,rgba(169,196,138,0.54),transparent_52%)] blur-[1px]"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 0.95, scale: 1 }}
          transition={{ duration: 2.4, ease: 'easeOut', delay: 0.25 }}
        />

        {petals.map((petal) => (
          <motion.span
            key={petal.id}
            className="absolute rounded-full bg-gradient-to-br from-teaRose-200/80 to-teaRose-300/70"
            style={{ left: petal.left, top: '-10%', width: petal.size, height: petal.size * 0.7 }}
            initial={{ opacity: 0, rotate: 0, y: -20 }}
            animate={{ opacity: [0, 0.65, 0.5, 0], rotate: [0, 120, 240], y: ['-4vh', '108vh'] }}
            transition={{
              duration: petal.duration,
              delay: petal.delay,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        ))}

        {dust.map((particle) => (
          <motion.span
            key={particle.id}
            className="absolute h-1 w-1 rounded-full bg-champagne-500/75"
            style={{ left: particle.left, top: particle.top }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.8, 0.2, 0], y: [-4, 4, -2], x: [-2, 2, 0] }}
            transition={{
              duration: particle.duration,
              delay: particle.delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}

        <div className="absolute inset-0 flex items-center justify-center">
          {/* Framer Motion: monogram fades/scales in at the center as hero focal point. */}
          <motion.div
            className="gold-frame flex h-44 w-44 items-center justify-center rounded-full bg-white/62 backdrop-blur-md shadow-floral"
            initial={{ opacity: 0, scale: 0.78, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 1.4, ease: 'easeOut', delay: 0.8 }}
          >
            <span className="font-display text-5xl tracking-[0.08em] text-champagne-700 sm:text-6xl">Igor e Bianca</span>
          </motion.div>
        </div>

        {/* Framer Motion: title typography appears with staged fade-in like a premium invite film. */}
        <motion.div
          className="absolute bottom-8 left-1/2 w-full max-w-3xl -translate-x-1/2 px-6 text-center"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, ease: 'easeOut', delay: 2.2 }}
        >
          <p className="font-display text-3xl leading-tight text-champagne-800 sm:text-5xl">
            O Amor Floresce.
          </p>
          <p className="mt-1 text-lg text-zinc-700/90 sm:text-2xl">[Igor e Bianca]. 18.04.2027</p>
        </motion.div>
      </motion.div>
    </section>
  );
}
