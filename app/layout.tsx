import type { Metadata } from 'next';
import { Cormorant_Garamond, Manrope } from 'next/font/google';
import './globals.css';
import { SplashScreen } from '@/components/splash-screen';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-cormorant',
});

export const metadata: Metadata = {
  title: 'Igor-e-Bianca | Convite de Casamento',
  description: 'Convite premium floral com painel admin para codigos e acessos.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${manrope.variable} ${cormorant.variable} bg-cream font-body text-zinc-800 antialiased`}>
        <SplashScreen />
        {children}
      </body>
    </html>
  );
}
