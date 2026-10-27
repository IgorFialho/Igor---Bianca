import type { Metadata } from 'next';
import { Instrument_Sans, Instrument_Serif } from 'next/font/google';
import './globals.css';
import { IntroArco } from '@/components/intro-arco';
import { SiteMusicPlayer } from '@/components/site-music-player';
import { SmoothScroll } from '@/components/smooth-scroll';

const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-body',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'Igor-e-Bianca | Convite de Casamento',
  description: 'Convite premium floral com painel admin para codigos e acessos.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${instrumentSans.variable} ${instrumentSerif.variable} bg-cream font-body text-zinc-800 antialiased`}>
        <SmoothScroll />
        <IntroArco />
        <SiteMusicPlayer />
        {children}
      </body>
    </html>
  );
}
