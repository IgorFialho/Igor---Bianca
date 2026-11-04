"use client";

import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

// Altura do menu fixo do topo.
const HEADER_OFFSET = 96;

/**
 * Onde a página deve parar para mostrar uma seção do menu:
 * - se a seção cabe na tela, ela fica centralizada;
 * - se é mais alta que a tela (ou centralizar esconderia o começo atrás do menu), o conteúdo começa logo abaixo
 *   do menu, sem deixar espaço vazio sobrando acima dele.
 */
function sectionScrollTop(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const top = rect.top + window.scrollY;
  const viewport = window.innerHeight;

  // Distância entre o topo da seção e o primeiro conteúdo visível (título, texto, foto ou formulário).
  const firstContent = element.querySelector('h1, h2, h3, h4, p, img, picture, form');
  const contentOffset = firstContent
    ? Math.max(0, firstContent.getBoundingClientRect().top - rect.top)
    : parseFloat(window.getComputedStyle(element).paddingTop) || 0;
  const centeredGap = (viewport - rect.height) / 2;

  // Centraliza, desde que o começo do conteúdo não fique escondido atrás do menu.
  if (rect.height <= viewport && centeredGap + contentOffset >= HEADER_OFFSET) {
    return Math.max(0, top - centeredGap);
  }

  return Math.max(0, top - Math.max(0, HEADER_OFFSET - contentOffset));
}

// Rolagem suave em todo o site, igual à Cordially (Lenis com lerp 0.18): a roda do mouse vira um
// movimento contínuo, então as animações ligadas à rolagem (topo, "nossa história") não dão saltos.
export function SmoothScroll() {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith('/admin');
  const lenisRef = useRef<Lenis | null>(null);

  // Página aberta já com "#seção" no endereço.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const scrollToSection = () => {
      const element = document.getElementById(id);
      if (!element) return;
      window.scrollTo({ top: sectionScrollTop(element), behavior: 'instant' as ScrollBehavior });
    };
    // Repete algumas vezes: fotos e seções presas na tela mudam a altura da página ao carregar.
    const timers = [50, 400, 1200].map((delay) => window.setTimeout(scrollToSection, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [pathname]);

  useEffect(() => {
    if (isAdminRoute) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const lenis = new Lenis({
      lerp: 0.18,
      smoothWheel: true,
      autoRaf: true,
      // Os links "#seção" são tratados abaixo (para centralizar a seção).
      anchors: false,
      // Não rola a página quando ela está travada (introdução, mensagem aberta, foto ampliada).
      virtualScroll: () =>
        document.documentElement.style.overflow !== 'hidden' && document.body.style.overflow !== 'hidden',
    });
    lenisRef.current = lenis;

    // Recalcula a altura quando a página cresce (ex.: mensagens novas chegando).
    const observer = new ResizeObserver(() => lenis.resize());
    observer.observe(document.body);

    return () => {
      observer.disconnect();
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [isAdminRoute]);

  // Links "#seção" (menu, "Confirmar presença"...): rolam suavemente até a posição de sectionScrollTop.
  useEffect(() => {
    if (isAdminRoute) return;

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement)) return;
      const url = new URL(link.href, window.location.href);
      if (!url.hash || url.pathname !== window.location.pathname || url.search !== window.location.search) return;
      const element = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (!element) return;

      event.preventDefault();
      // Espera o menu (aberto no celular) fechar e destravar a página antes de medir e rolar.
      window.requestAnimationFrame(() => {
        const top = sectionScrollTop(element);
        if (lenisRef.current) {
          lenisRef.current.scrollTo(top, { force: true });
        } else {
          const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
        }
      });
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [isAdminRoute]);

  return null;
}
