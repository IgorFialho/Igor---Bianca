"use client";

import { useEffect, useState } from 'react';

type NavLink = { label: string; href: string };

type SiteHeaderProps = {
  ctaLabel: string;
  ctaHref: string;
  links: NavLink[];
};

// Menu fixo sem fundo: só o botão e o ícone do menu flutuam sobre a página. O ícone é branco
// sobre a foto cheia do topo e fica escuro assim que a rolagem começa.
export function SiteHeader({ ctaLabel, ctaHref, links }: SiteHeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const update = () => setIsScrolled(window.scrollY > 80);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <nav className="pointer-events-none fixed inset-x-0 top-0 z-50 px-4 pt-[18px]">
      <div
        className="relative mx-auto h-[72px] w-full transition-colors duration-300"
        style={{ color: isScrolled ? '#2f241b' : '#ffffff' }}
      >
        <div className="flex h-full items-center justify-end px-4 md:px-6">
          <div className="pointer-events-auto flex items-center gap-4">
            <a
              href={ctaHref}
              className="rounded-full bg-champagne-600 px-4 py-1.5 text-sm font-medium text-[#fff9f1] transition-opacity hover:opacity-90"
            >
              {ctaLabel}
            </a>
            <button
              type="button"
              aria-label="Abrir menu"
              aria-expanded={isMenuOpen}
              aria-controls="menu-principal"
              onClick={() => setIsMenuOpen((open) => !open)}
              className="rounded-md p-2 transition-transform active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
            >
              <span className="relative flex h-2.5 w-6 flex-col justify-between">
                <span
                  className={`h-0.5 w-full origin-center bg-current transition-all duration-300 ${isMenuOpen ? 'translate-y-[4px] rotate-45' : ''}`}
                />
                <span
                  className={`h-0.5 w-full origin-center bg-current transition-all duration-300 ${isMenuOpen ? '-translate-y-[4px] -rotate-45' : ''}`}
                />
              </span>
            </button>
          </div>
        </div>

        {/* Menu aberto com efeito de vidro: fundo creme bem translúcido e desfoque do que está atrás. */}
        <div
          id="menu-principal"
          className={`absolute end-0 top-full mt-2 min-w-[200px] origin-top-right rounded-2xl border border-white/50 bg-[rgba(255,250,241,0.35)] p-4 text-center shadow-[0_20px_50px_rgba(47,36,27,0.18)] backdrop-blur-xl backdrop-saturate-150 transition-all duration-300 ${
            isMenuOpen ? 'pointer-events-auto visible scale-100 opacity-100' : 'pointer-events-none invisible scale-95 opacity-0'
          }`}
        >
          <ul className="flex flex-col gap-4">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className="block px-2 py-2 text-lg text-zinc-800 opacity-85 transition-opacity hover:opacity-100"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  );
}
