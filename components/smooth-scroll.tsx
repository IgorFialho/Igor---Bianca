"use client";

import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

// Rolagem suave em todo o site, igual à Cordially (Lenis com lerp 0.18): a roda do mouse vira um
// movimento contínuo, então as animações ligadas à rolagem (topo, "nossa história") não dão saltos.
export function SmoothScroll() {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith('/admin');

  useEffect(() => {
    if (isAdminRoute) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const lenis = new Lenis({
      lerp: 0.18,
      smoothWheel: true,
      autoRaf: true,
      // Links "#secao" do menu também rolam suavemente, descontando o menu fixo.
      anchors: { offset: -96 },
      // Não rola a página quando ela está travada (introdução, mensagem aberta, foto ampliada).
      virtualScroll: () =>
        document.documentElement.style.overflow !== 'hidden' && document.body.style.overflow !== 'hidden',
    });

    // Recalcula a altura quando a página cresce (ex.: mensagens novas chegando).
    const observer = new ResizeObserver(() => lenis.resize());
    observer.observe(document.body);

    return () => {
      observer.disconnect();
      lenis.destroy();
    };
  }, [isAdminRoute]);

  return null;
}
